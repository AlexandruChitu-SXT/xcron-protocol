use multiversx_sc_scenario::*;

fn world() -> ScenarioWorld {
    let mut blockchain = ScenarioWorld::new();
    blockchain.register_contract(
        "mxsc:output/keeper-registry.mxsc.json",
        keeper_registry::ContractBuilder,
    );
    blockchain
}

#[test]
fn deploy_and_register_scenario() {
    world().run("scenarios/deploy_and_register.scen.json");
}
