use multiversx_sc_scenario::*;

fn world() -> ScenarioWorld {
    let mut blockchain = ScenarioWorld::new();
    blockchain.register_contract(
        "mxsc:output/rewards.mxsc.json",
        rewards::ContractBuilder,
    );
    blockchain
}

// ═══════════════════════════════════════════════════════════
//  DEPLOYMENT
// ═══════════════════════════════════════════════════════════

#[test]
fn deploy_and_claim() {
    world().run("scenarios/deploy_and_claim.scen.json");
}

// ═══════════════════════════════════════════════════════════
//  FEE RECEPTION & REWARD CLAIMS
// ═══════════════════════════════════════════════════════════

#[test]
fn receive_fee_and_claim() {
    world().run("scenarios/receive_fee_and_claim.scen.json");
}

// ═══════════════════════════════════════════════════════════
//  TREASURY
// ═══════════════════════════════════════════════════════════

#[test]
fn treasury_withdraw() {
    world().run("scenarios/treasury_withdraw.scen.json");
}
