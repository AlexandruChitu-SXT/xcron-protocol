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

// ═══════════════════════════════════════════════════════════
//  TASK EXECUTION
// ═══════════════════════════════════════════════════════════

#[test]
fn execute_task() {
    world().run("scenarios/execute_task.scen.json");
}

#[test]
fn execute_paused() {
    world().run("scenarios/execute_paused.scen.json");
}

// ═══════════════════════════════════════════════════════════
//  SECURITY (C-2 Target Validation)
// ═══════════════════════════════════════════════════════════

#[test]
fn target_self_blocked() {
    world().run("scenarios/target_self_blocked.scen.json");
}

// ═══════════════════════════════════════════════════════════
//  KEEPER AUTHORIZATION
// ═══════════════════════════════════════════════════════════

#[test]
fn execute_unauthorized() {
    world().run("scenarios/execute_unauthorized.scen.json");
}

#[test]
fn execute_not_ripe() {
    world().run("scenarios/execute_not_ripe.scen.json");
}

// ═══════════════════════════════════════════════════════════
//  CIRCUIT BREAKER (Pause/Unpause)
// ═══════════════════════════════════════════════════════════

#[test]
fn schedule_while_paused() {
    world().run("scenarios/schedule_while_paused.scen.json");
}

// ═══════════════════════════════════════════════════════════
//  INPUT VALIDATION
// ═══════════════════════════════════════════════════════════

#[test]
fn gas_too_low() {
    world().run("scenarios/gas_too_low.scen.json");
}

#[test]
fn fee_exceeds_100() {
    world().run("scenarios/fee_exceeds_100.scen.json");
}

// ═══════════════════════════════════════════════════════════
//  ACCESS CONTROL (Owner-only Config)
// ═══════════════════════════════════════════════════════════

#[test]
fn config_owner_only() {
    world().run("scenarios/config_owner_only.scen.json");
}
