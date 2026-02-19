use multiversx_sc_scenario::*;

fn world() -> ScenarioWorld {
    let mut blockchain = ScenarioWorld::new();
    blockchain.register_contract(
        "mxsc:output/scheduler.mxsc.json",
        scheduler::ContractBuilder,
    );
    blockchain
}

// ═══════════════════════════════════════════════════════════
//  DEPLOYMENT
// ═══════════════════════════════════════════════════════════

#[test]
fn deploy_scenario() {
    world().run("scenarios/deploy.scen.json");
}

// ═══════════════════════════════════════════════════════════
//  TASK SCHEDULING
// ═══════════════════════════════════════════════════════════

#[test]
fn schedule_and_cancel() {
    world().run("scenarios/schedule_and_cancel.scen.json");
}

#[test]
fn schedule_recurring() {
    world().run("scenarios/schedule_recurring.scen.json");
}

#[test]
fn deposit_below_minimum() {
    world().run("scenarios/deposit_below_minimum.scen.json");
}

// ═══════════════════════════════════════════════════════════
//  ACCESS CONTROL
// ═══════════════════════════════════════════════════════════

#[test]
fn cancel_unauthorized() {
    world().run("scenarios/cancel_unauthorized.scen.json");
}

// ═══════════════════════════════════════════════════════════
//  EXPIRATION
// ═══════════════════════════════════════════════════════════

#[test]
fn expire_stale_tasks() {
    world().run("scenarios/expire_stale.scen.json");
}
