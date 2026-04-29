#![no_std]
//! Stellar Swap — Constant-product AMM (`x * y = k`) with 0.3% swap fee.
//!
//! ## Inter-contract calls
//! - `add_liquidity` performs **3 cross-contract calls**:
//!     1. `token_a.transfer(provider → amm, amount_a)`
//!     2. `token_b.transfer(provider → amm, amount_b)`
//!     3. `lp_token.mint(amm → provider, shares)`
//! - `remove_liquidity` performs **3 cross-contract calls**:
//!     1. `lp_token.burn(amm, shares)`
//!     2. `token_a.transfer(amm → provider, amount_a)`
//!     3. `token_b.transfer(amm → provider, amount_b)`
//! - `swap` performs **2 cross-contract calls**:
//!     1. `token_in.transfer(user → amm, amount_in)`
//!     2. `token_out.transfer(amm → user, amount_out)`

use soroban_sdk::{
    contract, contractclient, contracterror, contractimpl, contracttype, Address, Env,
};

const FEE_BPS: i128 = 30; // 0.30%
const FEE_DENOM: i128 = 10_000;
const MIN_LIQUIDITY: i128 = 1_000; // burn-on-init dust to avoid division issues

#[contractclient(name = "TokenClient")]
pub trait TokenInterface {
    fn balance(env: Env, id: Address) -> i128;
    fn transfer(env: Env, from: Address, to: Address, amount: i128);
}

#[contractclient(name = "LpClient")]
pub trait LpInterface {
    fn balance(env: Env, id: Address) -> i128;
    fn total_supply(env: Env) -> i128;
    fn mint(env: Env, to: Address, amount: i128);
    fn burn(env: Env, from: Address, amount: i128);
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    TokenA,
    TokenB,
    LpToken,
    ReserveA,
    ReserveB,
    Initialized,
    TotalSwaps,
}

#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidAmount = 3,
    InsufficientLiquidity = 4,
    SlippageExceeded = 5,
    PoolEmpty = 6,
    Overflow = 7,
    UnbalancedDeposit = 8,
}

#[contract]
pub struct Amm;

#[contractimpl]
impl Amm {
    pub fn init(
        env: Env,
        token_a: Address,
        token_b: Address,
        lp_token: Address,
    ) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Initialized) {
            return Err(Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::TokenA, &token_a);
        env.storage().instance().set(&DataKey::TokenB, &token_b);
        env.storage().instance().set(&DataKey::LpToken, &lp_token);
        env.storage().instance().set(&DataKey::ReserveA, &0i128);
        env.storage().instance().set(&DataKey::ReserveB, &0i128);
        env.storage().instance().set(&DataKey::TotalSwaps, &0u32);
        env.storage().instance().set(&DataKey::Initialized, &true);
        Ok(())
    }

    /// Add liquidity. First call sets the price; subsequent calls must
    /// match the existing pool ratio (within 1% tolerance).
    pub fn add_liquidity(
        env: Env,
        provider: Address,
        amount_a: i128,
        amount_b: i128,
    ) -> Result<i128, Error> {
        provider.require_auth();
        if amount_a <= 0 || amount_b <= 0 {
            return Err(Error::InvalidAmount);
        }

        let token_a: Address = env
            .storage()
            .instance()
            .get(&DataKey::TokenA)
            .ok_or(Error::NotInitialized)?;
        let token_b: Address = env.storage().instance().get(&DataKey::TokenB).unwrap();
        let lp: Address = env.storage().instance().get(&DataKey::LpToken).unwrap();

        let res_a: i128 = env.storage().instance().get(&DataKey::ReserveA).unwrap_or(0);
        let res_b: i128 = env.storage().instance().get(&DataKey::ReserveB).unwrap_or(0);

        let lp_client = LpClient::new(&env, &lp);
        let total_lp = lp_client.total_supply();

        let shares: i128;
        if total_lp == 0 {
            // initial deposit: shares = sqrt(a*b) - MIN_LIQUIDITY
            let product = amount_a.checked_mul(amount_b).ok_or(Error::Overflow)?;
            let s = isqrt(product);
            if s <= MIN_LIQUIDITY {
                return Err(Error::InsufficientLiquidity);
            }
            shares = s - MIN_LIQUIDITY;
        } else {
            // Subsequent deposit must respect ratio: amount_b / amount_a == res_b / res_a
            // expected_b = amount_a * res_b / res_a
            let expected_b = amount_a.checked_mul(res_b).ok_or(Error::Overflow)? / res_a;
            // 1% tolerance
            let lo = expected_b * 99 / 100;
            let hi = expected_b * 101 / 100;
            if amount_b < lo || amount_b > hi {
                return Err(Error::UnbalancedDeposit);
            }
            // shares = min(a*total/res_a, b*total/res_b)
            let s_a = amount_a.checked_mul(total_lp).ok_or(Error::Overflow)? / res_a;
            let s_b = amount_b.checked_mul(total_lp).ok_or(Error::Overflow)? / res_b;
            shares = if s_a < s_b { s_a } else { s_b };
            if shares <= 0 {
                return Err(Error::InsufficientLiquidity);
            }
        }

        // ─── Inter-contract call #1: pull token A
        let token_a_client = TokenClient::new(&env, &token_a);
        token_a_client.transfer(&provider, &env.current_contract_address(), &amount_a);

        // ─── Inter-contract call #2: pull token B
        let token_b_client = TokenClient::new(&env, &token_b);
        token_b_client.transfer(&provider, &env.current_contract_address(), &amount_b);

        // ─── Inter-contract call #3: mint LP shares to provider
        lp_client.mint(&provider, &shares);

        env.storage()
            .instance()
            .set(&DataKey::ReserveA, &(res_a + amount_a));
        env.storage()
            .instance()
            .set(&DataKey::ReserveB, &(res_b + amount_b));

        Ok(shares)
    }

    /// Remove liquidity proportional to share of total LP supply.
    pub fn remove_liquidity(
        env: Env,
        provider: Address,
        shares: i128,
    ) -> Result<(i128, i128), Error> {
        provider.require_auth();
        if shares <= 0 {
            return Err(Error::InvalidAmount);
        }

        let token_a: Address = env
            .storage()
            .instance()
            .get(&DataKey::TokenA)
            .ok_or(Error::NotInitialized)?;
        let token_b: Address = env.storage().instance().get(&DataKey::TokenB).unwrap();
        let lp: Address = env.storage().instance().get(&DataKey::LpToken).unwrap();

        let res_a: i128 = env.storage().instance().get(&DataKey::ReserveA).unwrap_or(0);
        let res_b: i128 = env.storage().instance().get(&DataKey::ReserveB).unwrap_or(0);

        let lp_client = LpClient::new(&env, &lp);
        let total_lp = lp_client.total_supply();
        if total_lp == 0 {
            return Err(Error::PoolEmpty);
        }

        let amount_a = shares.checked_mul(res_a).ok_or(Error::Overflow)? / total_lp;
        let amount_b = shares.checked_mul(res_b).ok_or(Error::Overflow)? / total_lp;
        if amount_a <= 0 || amount_b <= 0 {
            return Err(Error::InsufficientLiquidity);
        }

        // ─── Inter-contract call #1: burn LP shares
        lp_client.burn(&provider, &shares);

        // ─── Inter-contract call #2: send token A
        let token_a_client = TokenClient::new(&env, &token_a);
        token_a_client.transfer(&env.current_contract_address(), &provider, &amount_a);

        // ─── Inter-contract call #3: send token B
        let token_b_client = TokenClient::new(&env, &token_b);
        token_b_client.transfer(&env.current_contract_address(), &provider, &amount_b);

        env.storage()
            .instance()
            .set(&DataKey::ReserveA, &(res_a - amount_a));
        env.storage()
            .instance()
            .set(&DataKey::ReserveB, &(res_b - amount_b));

        Ok((amount_a, amount_b))
    }

    /// Swap an exact `amount_in` of `token_a` (if `a_to_b` is true) or `token_b`
    /// for the other side. Returns actual output. Reverts if `min_out` not met.
    pub fn swap(
        env: Env,
        user: Address,
        a_to_b: bool,
        amount_in: i128,
        min_out: i128,
    ) -> Result<i128, Error> {
        user.require_auth();
        if amount_in <= 0 {
            return Err(Error::InvalidAmount);
        }

        let token_a: Address = env
            .storage()
            .instance()
            .get(&DataKey::TokenA)
            .ok_or(Error::NotInitialized)?;
        let token_b: Address = env.storage().instance().get(&DataKey::TokenB).unwrap();

        let res_a: i128 = env.storage().instance().get(&DataKey::ReserveA).unwrap_or(0);
        let res_b: i128 = env.storage().instance().get(&DataKey::ReserveB).unwrap_or(0);
        if res_a == 0 || res_b == 0 {
            return Err(Error::PoolEmpty);
        }

        let (in_addr, out_addr, reserve_in, reserve_out) = if a_to_b {
            (token_a, token_b, res_a, res_b)
        } else {
            (token_b, token_a, res_b, res_a)
        };

        // amount_out = (amount_in * 9970 * reserve_out) / (reserve_in * 10000 + amount_in * 9970)
        let amt_in_after_fee = amount_in
            .checked_mul(FEE_DENOM - FEE_BPS)
            .ok_or(Error::Overflow)?;
        let numerator = amt_in_after_fee
            .checked_mul(reserve_out)
            .ok_or(Error::Overflow)?;
        let denominator = reserve_in
            .checked_mul(FEE_DENOM)
            .ok_or(Error::Overflow)?
            .checked_add(amt_in_after_fee)
            .ok_or(Error::Overflow)?;
        let amount_out = numerator / denominator;

        if amount_out < min_out {
            return Err(Error::SlippageExceeded);
        }
        if amount_out >= reserve_out {
            return Err(Error::InsufficientLiquidity);
        }

        // ─── Inter-contract call #1: pull tokens in
        let in_client = TokenClient::new(&env, &in_addr);
        in_client.transfer(&user, &env.current_contract_address(), &amount_in);

        // ─── Inter-contract call #2: send tokens out
        let out_client = TokenClient::new(&env, &out_addr);
        out_client.transfer(&env.current_contract_address(), &user, &amount_out);

        // update reserves
        if a_to_b {
            env.storage()
                .instance()
                .set(&DataKey::ReserveA, &(res_a + amount_in));
            env.storage()
                .instance()
                .set(&DataKey::ReserveB, &(res_b - amount_out));
        } else {
            env.storage()
                .instance()
                .set(&DataKey::ReserveA, &(res_a - amount_out));
            env.storage()
                .instance()
                .set(&DataKey::ReserveB, &(res_b + amount_in));
        }

        let total: u32 = env.storage().instance().get(&DataKey::TotalSwaps).unwrap_or(0);
        env.storage().instance().set(&DataKey::TotalSwaps, &(total + 1));

        Ok(amount_out)
    }

    // ─── pure view helpers ─────────────────────────────────────────────

    /// Quote a swap without executing — useful for the UI.
    pub fn quote_swap(env: Env, a_to_b: bool, amount_in: i128) -> Result<i128, Error> {
        if amount_in <= 0 {
            return Err(Error::InvalidAmount);
        }
        let res_a: i128 = env.storage().instance().get(&DataKey::ReserveA).unwrap_or(0);
        let res_b: i128 = env.storage().instance().get(&DataKey::ReserveB).unwrap_or(0);
        if res_a == 0 || res_b == 0 {
            return Err(Error::PoolEmpty);
        }
        let (reserve_in, reserve_out) = if a_to_b { (res_a, res_b) } else { (res_b, res_a) };
        let amt = amount_in
            .checked_mul(FEE_DENOM - FEE_BPS)
            .ok_or(Error::Overflow)?;
        let numerator = amt.checked_mul(reserve_out).ok_or(Error::Overflow)?;
        let denominator = reserve_in
            .checked_mul(FEE_DENOM)
            .ok_or(Error::Overflow)?
            .checked_add(amt)
            .ok_or(Error::Overflow)?;
        Ok(numerator / denominator)
    }

    pub fn reserves(env: Env) -> (i128, i128) {
        let a = env.storage().instance().get(&DataKey::ReserveA).unwrap_or(0);
        let b = env.storage().instance().get(&DataKey::ReserveB).unwrap_or(0);
        (a, b)
    }

    pub fn token_a(env: Env) -> Address {
        env.storage().instance().get(&DataKey::TokenA).unwrap()
    }

    pub fn token_b(env: Env) -> Address {
        env.storage().instance().get(&DataKey::TokenB).unwrap()
    }

    pub fn lp_token(env: Env) -> Address {
        env.storage().instance().get(&DataKey::LpToken).unwrap()
    }

    pub fn fee_bps(_env: Env) -> u32 {
        FEE_BPS as u32
    }

    pub fn total_swaps(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::TotalSwaps).unwrap_or(0)
    }
}

/// Integer square root (Newton's method).
fn isqrt(n: i128) -> i128 {
    if n < 2 {
        return n;
    }
    let mut x = n;
    let mut y = (x + 1) / 2;
    while y < x {
        x = y;
        y = (x + n / x) / 2;
    }
    x
}

#[cfg(test)]
mod test;
