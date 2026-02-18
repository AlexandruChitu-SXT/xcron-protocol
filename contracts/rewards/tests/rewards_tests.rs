use multiversx_sc_scenario::*;

fn world() -> ScenarioWorld {
    let mut blockchain = ScenarioWorld::new();
    blockchain.register_contract(
        "mxsc:output/rewards.mxsc.json",
        rewards::ContractBuilder,
    );
    blockchain
}

#[test]
fn deploy_and_claim_scenario() {
    world().run("scenarios/deploy_and_claim.scen.json");
}
