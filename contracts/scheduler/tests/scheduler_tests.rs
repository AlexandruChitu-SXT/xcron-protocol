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

#[test]
fn condition_on_chain() {
    world().run("scenarios/condition_on_chain.scen.json");
}

// ═══════════════════════════════════════════════════════════
//  ACCESS CONTROL
// ═══════════════════════════════════════════════════════════

#[test]
fn cancel_unauthorized() {
    world().run("scenarios/cancel_unauthorized.scen.json");
}

#[test]
fn config_owner_only() {
    world().run("scenarios/config_owner_only.scen.json");
}

#[test]
fn execute_unauthorized() {
    world().run("scenarios/execute_unauthorized.scen.json");
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

#[test]
fn execute_not_ripe() {
    world().run("scenarios/execute_not_ripe.scen.json");
}

#[test]
fn round_robin_assignment() {
    world().run("scenarios/round_robin_assignment.scen.json");
}

#[test]
fn recover_stuck_task() {
    world().run("scenarios/recover_stuck_task.scen.json");
}

// ═══════════════════════════════════════════════════════════
//  CIRCUIT BREAKER (Pause/Unpause)
// ═══════════════════════════════════════════════════════════

#[test]
fn schedule_while_paused() {
    world().run("scenarios/schedule_while_paused.scen.json");
}

// ═══════════════════════════════════════════════════════════
//  EXPIRATION & TTL
// ═══════════════════════════════════════════════════════════

#[test]
fn expire_stale_tasks() {
    world().run("scenarios/expire_stale.scen.json");
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
//  SECURITY RULES  (S-1 to S-10)
// ═══════════════════════════════════════════════════════════

/// S-1a: Cannot target scheduler, registry, or rewards contracts
#[test]
fn target_self_blocked() {
    world().run("scenarios/target_self_blocked.scen.json");
}

/// S-1b: Dangerous endpoints (upgradeContract, ESDTTransfer, setOwner) are blocked
#[test]
fn dangerous_endpoint_blocked() {
    world().run("scenarios/dangerous_endpoint_blocked.scen.json");
}

/// S-3/S-4: Admin blacklist and unblacklist with access control
#[test]
fn admin_blacklist() {
    world().run("scenarios/admin_blacklist.scen.json");
}

// ═══════════════════════════════════════════════════════════
//  CROSS-SHARD OPTIMIZATION
// ═══════════════════════════════════════════════════════════

/// Cross-shard views: getTasksForShard, getCrossShardStats
#[test]
fn cross_shard_views() {
    world().run("scenarios/cross_shard_views.scen.json");
}

/// Dynamic gas calculation: verifies cross-shard overhead enforcement
#[test]
fn dynamic_gas_calculation() {
    world().run("scenarios/dynamic_gas_calculation.scen.json");
}

