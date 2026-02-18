use multiversx_sc_scenario::*;

fn world() -> ScenarioWorld {
    let mut blockchain = ScenarioWorld::new();
    blockchain.register_contract(
        "mxsc:output/scheduler.mxsc.json",
        scheduler::ContractBuilder,
    );
    blockchain
}

#[test]
fn deploy_scenario() {
    world().run("scenarios/deploy.scen.json");
}
