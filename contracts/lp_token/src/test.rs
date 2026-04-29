#![cfg(test)]
extern crate std;

use super::{Error, LpToken, LpTokenClient};
use soroban_sdk::{testutils::Address as _, Address, Env, String};

fn setup() -> (Env, LpTokenClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let id = env.register(LpToken, ());
    let client = LpTokenClient::new(&env, &id);
    client.init(
        &admin,
        &7,
        &String::from_str(&env, "STAR-MOON LP"),
        &String::from_str(&env, "S-LP"),
    );
    (env, client, admin)
}

#[test]
fn init_ok() {
    let (env, c, _) = setup();
    assert_eq!(c.total_supply(), 0);
    assert_eq!(c.symbol(), String::from_str(&env, "S-LP"));
}

#[test]
fn double_init_rejected() {
    let (env, c, admin) = setup();
    let res = c.try_init(
        &admin,
        &7,
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
    );
    assert_eq!(res, Err(Ok(Error::AlreadyInitialized)));
}

#[test]
fn admin_mint_increases_supply() {
    let (env, c, _) = setup();
    let user = Address::generate(&env);
    c.mint(&user, &1_000);
    assert_eq!(c.balance(&user), 1_000);
    assert_eq!(c.total_supply(), 1_000);
}

#[test]
fn admin_burn_decreases_supply() {
    let (env, c, _) = setup();
    let user = Address::generate(&env);
    c.mint(&user, &1_000);
    c.burn(&user, &400);
    assert_eq!(c.balance(&user), 600);
    assert_eq!(c.total_supply(), 600);
}

#[test]
fn burn_insufficient_rejected() {
    let (env, c, _) = setup();
    let user = Address::generate(&env);
    c.mint(&user, &100);
    let res = c.try_burn(&user, &200);
    assert_eq!(res, Err(Ok(Error::InsufficientBalance)));
}

#[test]
fn transfer_works() {
    let (env, c, _) = setup();
    let a = Address::generate(&env);
    let b = Address::generate(&env);
    c.mint(&a, &1_000);
    c.transfer(&a, &b, &300);
    assert_eq!(c.balance(&a), 700);
    assert_eq!(c.balance(&b), 300);
}

#[test]
fn invalid_amount_rejected() {
    let (env, c, _) = setup();
    let a = Address::generate(&env);
    let res = c.try_mint(&a, &-5);
    assert_eq!(res, Err(Ok(Error::InvalidAmount)));
}
