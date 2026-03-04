use multiversx_sc_scenario::*;

fn world() -> ScenarioWorld {
    let mut blockchain = ScenarioWorld::new();
    blockchain.register_contract(
        "file:output/keeper-registry.mxsc.json",
        keeper_registry::ContractBuilder,
    );
    blockchain
}

// ═══════════════════════════════════════════════════════════
//  DEPLOYMENT & REGISTRATION
// ═══════════════════════════════════════════════════════════

#[test]
fn deploy_and_register() {
    world().run("scenarios/deploy_and_register.scen.json");
}

#[test]
fn register_below_min_stake() {
    world().run("scenarios/register_below_min.scen.json");
}

#[test]
fn double_register() {
    world().run("scenarios/double_register.scen.json");
}

// ═══════════════════════════════════════════════════════════
//  STAKING
// ═══════════════════════════════════════════════════════════

#[test]
fn add_stake() {
    world().run("scenarios/add_stake.scen.json");
}

// ═══════════════════════════════════════════════════════════
//  UNSTAKING
// ═══════════════════════════════════════════════════════════

#[test]
fn unstake_flow() {
    world().run("scenarios/unstake_flow.scen.json");
}

// ═══════════════════════════════════════════════════════════
//  STAKING V5 DELEGATION
// ═══════════════════════════════════════════════════════════

#[test]
fn staking_v5_delegation() {
    world().run("scenarios/staking_v5_delegation.scen.json");
}
