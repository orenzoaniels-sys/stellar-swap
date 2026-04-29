#![cfg(test)]
extern crate std;

use super::{Amm, AmmClient, Error};
use lp_token::{LpToken, LpTokenClient};
use soroban_sdk::{testutils::Address as _, Address, Env, String};
use token::{Token, TokenClient};

const ONE: i128 = 10_000_000;

struct World {
    env: Env,
    star: TokenClient<'static>,
    moon: TokenClient<'static>,
    lp: LpTokenClient<'static>,
    amm: AmmClient<'static>,
    admin: Address,
}

fn world() -> World {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);

    // Deploy token A (STAR)
    let star_id = env.register(Token, ());
    let star = TokenClient::new(&env, &star_id);
    star.init(
        &admin,
        &7,
        &String::from_str(&env, "Stellar Star"),
        &String::from_str(&env, "STAR"),
    );

    // Deploy token B (MOON)
    let moon_id = env.register(Token, ());
    let moon = TokenClient::new(&env, &moon_id);
    moon.init(
        &admin,
        &7,
        &String::from_str(&env, "Stellar Moon"),
        &String::from_str(&env, "MOON"),
    );

    // Deploy AMM (so we can use its address as LP admin)
    let amm_id = env.register(Amm, ());
    let amm = AmmClient::new(&env, &amm_id);

    // Deploy LP token, admin = AMM address
    let lp_id = env.register(LpToken, ());
    let lp = LpTokenClient::new(&env, &lp_id);
    lp.init(
        &amm_id,
        &7,
        &String::from_str(&env, "STAR-MOON LP"),
        &String::from_str(&env, "S-LP"),
    );

    // Init AMM with all 3 contract addresses
    amm.init(&star_id, &moon_id, &lp_id);

    World {
        env,
        star,
        moon,
        lp,
        amm,
        admin,
    }
}

fn fund(w: &World, who: &Address, star_amt: i128, moon_amt: i128) {
    w.star.mint(who, &star_amt);
    w.moon.mint(who, &moon_amt);
}

#[test]
fn init_stores_addresses() {
    let w = world();
    let _ = w.amm.token_a();
    let _ = w.amm.token_b();
    let _ = w.amm.lp_token();
    assert_eq!(w.amm.fee_bps(), 30);
    let (a, b) = w.amm.reserves();
    assert_eq!(a, 0);
    assert_eq!(b, 0);
}

#[test]
fn double_init_rejected() {
    let w = world();
    let res = w
        .amm
        .try_init(&w.star.address, &w.moon.address, &w.lp.address);
    assert_eq!(res, Err(Ok(Error::AlreadyInitialized)));
}

#[test]
fn add_liquidity_initial_mints_shares() {
    let w = world();
    let alice = Address::generate(&w.env);
    fund(&w, &alice, 1_000 * ONE, 4_000 * ONE);

    // 1 STAR = 4 MOON pricing → 1000 * 4000 = 4_000_000 (in ONE units squared)
    let shares = w.amm.add_liquidity(&alice, &(1_000 * ONE), &(4_000 * ONE));
    assert!(shares > 0);

    let (ra, rb) = w.amm.reserves();
    assert_eq!(ra, 1_000 * ONE);
    assert_eq!(rb, 4_000 * ONE);
    assert!(w.lp.balance(&alice) > 0);
    assert_eq!(w.lp.balance(&alice), shares);
}

#[test]
fn add_liquidity_unbalanced_rejected() {
    let w = world();
    let alice = Address::generate(&w.env);
    let bob = Address::generate(&w.env);
    fund(&w, &alice, 1_000 * ONE, 4_000 * ONE);
    w.amm.add_liquidity(&alice, &(1_000 * ONE), &(4_000 * ONE));

    // Bob tries to add at wrong ratio (1:1 instead of 1:4)
    fund(&w, &bob, 100 * ONE, 100 * ONE);
    let res = w.amm.try_add_liquidity(&bob, &(100 * ONE), &(100 * ONE));
    assert_eq!(res, Err(Ok(Error::UnbalancedDeposit)));
}

#[test]
fn add_liquidity_invalid_amount_rejected() {
    let w = world();
    let alice = Address::generate(&w.env);
    let res = w.amm.try_add_liquidity(&alice, &0, &100);
    assert_eq!(res, Err(Ok(Error::InvalidAmount)));
}

#[test]
fn second_provider_gets_proportional_shares() {
    let w = world();
    let alice = Address::generate(&w.env);
    let bob = Address::generate(&w.env);
    fund(&w, &alice, 1_000 * ONE, 4_000 * ONE);
    let s_a = w.amm.add_liquidity(&alice, &(1_000 * ONE), &(4_000 * ONE));

    fund(&w, &bob, 500 * ONE, 2_000 * ONE);
    let s_b = w.amm.add_liquidity(&bob, &(500 * ONE), &(2_000 * ONE));

    // Bob deposited half of Alice's share, so should get ~half the LP
    // (Alice's shares had MIN_LIQUIDITY locked, so bob's slightly larger ratio)
    assert!(s_b > 0);
    assert!(s_b < s_a);
}

#[test]
fn swap_a_to_b_updates_reserves_and_pays_user() {
    let w = world();
    let lp_user = Address::generate(&w.env);
    fund(&w, &lp_user, 1_000 * ONE, 4_000 * ONE);
    w.amm.add_liquidity(&lp_user, &(1_000 * ONE), &(4_000 * ONE));

    let trader = Address::generate(&w.env);
    w.star.mint(&trader, &(10 * ONE));

    let star_before = w.star.balance(&trader);
    let moon_before = w.moon.balance(&trader);

    let out = w.amm.swap(&trader, &true, &(10 * ONE), &0);
    assert!(out > 0);
    assert!(out < 40 * ONE); // less than 1:4 due to fee + slippage

    let star_after = w.star.balance(&trader);
    let moon_after = w.moon.balance(&trader);
    assert_eq!(star_before - star_after, 10 * ONE);
    assert_eq!(moon_after - moon_before, out);

    let (ra, rb) = w.amm.reserves();
    assert_eq!(ra, 1_000 * ONE + 10 * ONE);
    assert_eq!(rb, 4_000 * ONE - out);
    assert_eq!(w.amm.total_swaps(), 1);
}

#[test]
fn swap_b_to_a_works() {
    let w = world();
    let lp_user = Address::generate(&w.env);
    fund(&w, &lp_user, 1_000 * ONE, 4_000 * ONE);
    w.amm.add_liquidity(&lp_user, &(1_000 * ONE), &(4_000 * ONE));

    let trader = Address::generate(&w.env);
    w.moon.mint(&trader, &(40 * ONE));
    let out = w.amm.swap(&trader, &false, &(40 * ONE), &0);
    assert!(out > 0 && out < 10 * ONE);
    assert_eq!(w.star.balance(&trader), out);
}

#[test]
fn swap_slippage_exceeded_rejected() {
    let w = world();
    let lp_user = Address::generate(&w.env);
    fund(&w, &lp_user, 1_000 * ONE, 4_000 * ONE);
    w.amm.add_liquidity(&lp_user, &(1_000 * ONE), &(4_000 * ONE));

    let trader = Address::generate(&w.env);
    w.star.mint(&trader, &(10 * ONE));
    // Demand way more than possible
    let res = w.amm.try_swap(&trader, &true, &(10 * ONE), &(100 * ONE));
    assert_eq!(res, Err(Ok(Error::SlippageExceeded)));
}

#[test]
fn swap_empty_pool_rejected() {
    let w = world();
    let trader = Address::generate(&w.env);
    w.star.mint(&trader, &(10 * ONE));
    let res = w.amm.try_swap(&trader, &true, &(10 * ONE), &0);
    assert_eq!(res, Err(Ok(Error::PoolEmpty)));
}

#[test]
fn quote_swap_matches_actual() {
    let w = world();
    let lp_user = Address::generate(&w.env);
    fund(&w, &lp_user, 1_000 * ONE, 4_000 * ONE);
    w.amm.add_liquidity(&lp_user, &(1_000 * ONE), &(4_000 * ONE));

    let quote = w.amm.quote_swap(&true, &(10 * ONE));

    let trader = Address::generate(&w.env);
    w.star.mint(&trader, &(10 * ONE));
    let actual = w.amm.swap(&trader, &true, &(10 * ONE), &0);
    assert_eq!(quote, actual);
}

#[test]
fn remove_liquidity_returns_proportional() {
    let w = world();
    let alice = Address::generate(&w.env);
    fund(&w, &alice, 1_000 * ONE, 4_000 * ONE);
    let shares = w.amm.add_liquidity(&alice, &(1_000 * ONE), &(4_000 * ONE));

    // remove half her shares
    let half = shares / 2;
    let (a, b) = w.amm.remove_liquidity(&alice, &half);
    assert!(a > 0);
    assert!(b > 0);
    // approximately half the reserves
    assert!(a <= 500 * ONE && a > 495 * ONE);
    assert!(b <= 2_000 * ONE && b > 1_990 * ONE);
}

#[test]
fn remove_liquidity_invalid_amount_rejected() {
    let w = world();
    let alice = Address::generate(&w.env);
    let res = w.amm.try_remove_liquidity(&alice, &0);
    assert_eq!(res, Err(Ok(Error::InvalidAmount)));
}

#[test]
fn remove_liquidity_empty_pool_rejected() {
    let w = world();
    let alice = Address::generate(&w.env);
    let res = w.amm.try_remove_liquidity(&alice, &100);
    assert_eq!(res, Err(Ok(Error::PoolEmpty)));
}

#[test]
fn k_invariant_grows_after_swap_due_to_fee() {
    let w = world();
    let lp_user = Address::generate(&w.env);
    fund(&w, &lp_user, 1_000 * ONE, 4_000 * ONE);
    w.amm.add_liquidity(&lp_user, &(1_000 * ONE), &(4_000 * ONE));

    let (a0, b0) = w.amm.reserves();
    let k_before = a0 * b0;

    let trader = Address::generate(&w.env);
    w.star.mint(&trader, &(10 * ONE));
    w.amm.swap(&trader, &true, &(10 * ONE), &0);

    let (a1, b1) = w.amm.reserves();
    let k_after = a1 * b1;
    // Fees stay in the pool, so k must grow
    assert!(k_after > k_before);
}

#[test]
fn fee_admin_unchanged() {
    let w = world();
    let _ = w.admin; // suppress warning
    assert_eq!(w.amm.fee_bps(), 30);
}
