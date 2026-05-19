use reqwest::Client;
use serde_json::Value;
use std::time::Duration;
use tokio::time::sleep;

/// Simulated Context for XCron Task Triggers
#[derive(Debug, Clone)]
pub enum InternalTriggerMetadata {
  StateDriven {
    task_id: u64,
    oracle_address: String,
    query_endpoint: String,
    comparator: String,
    threshold: u64,
  },
  EventDriven {
    task_id: u64,
    emitter_contract: String,
    event_topic: String,
  },
}

/// The Event Engine continuously polls or listens to the chain
/// to evaluate off-chain conditions (StateDriven/EventDriven) 
/// and dispatches the payload to the executors when the condition matches.
pub async fn start_event_engine(tasks: Vec<InternalTriggerMetadata>) {
  println!(" [XCron Event Engine] State & Event Observers initialized");
  let client = Client::builder()
    .timeout(Duration::from_secs(5))
    .build()
    .expect("Error initializing HTTP client for Event Engine");

  // ️ XCRON-PROTECT: API base loaded from environment (never hardcoded to a single network)
  let api_base = std::env::var("MULTIVERSX_API_URL")
    .unwrap_or_else(|_| "https://testnet-api.multiversx.com".to_string());

  loop {
    for task in &tasks {
      match task {
        InternalTriggerMetadata::StateDriven {
          task_id,
          oracle_address,
          query_endpoint,
          comparator,
          threshold,
        } => {
          // Check State variables 
          // (Mocking the vm-query to an oracle or contract)
          let url = format!("{}/query", api_base);
          let payload = serde_json::json!({
            "scAddress": oracle_address,
            "funcName": query_endpoint,
            "args": []
          });

          // Simulated execution logic:
          // Si el vm-query es exitoso y el valor cumple el comparator frente al threshold,
          // el bot formatea el payload de "executeTask@[task_id]" y dispara a HFT.
          
          println!(" [State-Driven] Verificando Task #{} en contrato {}...", task_id, oracle_address);
        }
        InternalTriggerMetadata::EventDriven {
          task_id,
          emitter_contract,
          event_topic,
        } => {
          // Event Driven logic
          // En la V2 final este bloque suscribirá el bot a un WebSocket o 
          // tirará queries de elasticsearch a /events
          println!(" [Event-Driven] Escuchando logs '{}' para el contrato {} (Task #{})...", event_topic, emitter_contract, task_id);
        }
      }
    }

    // Cycle delay to prevent rate-limiting while polling public APIs.
    // HFT bots must use local Observers to lower this to 10ms.
    sleep(Duration::from_millis(2000)).await;
  }
}
