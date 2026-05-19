use std::time::{Instant, Duration};
use reqwest::Client;

pub struct KeeperSniffer {
  client: Client,
  target_url: String,
}

impl KeeperSniffer {
  pub fn new(base_url: &str) -> Self {
    Self {
      client: Client::new(),
      target_url: format!("{}/network/config", base_url),
    }
  }

  /// Ejecuta múltiples pings a la Devnet para calcular la latencia base (RTT - Round Trip Time)
  /// y calibra la ráfaga de fuego para la ventana de 42ms.
  pub async fn calibrate_network_latency(&self) -> Duration {
    println!(" [KEEPER SNIFFER] Iniciando ping de calibración hacia la Devnet...");
    
    let mut latencies = Vec::new();
    for i in 1..=5 {
      let start = Instant::now();
      if let Ok(resp) = self.client.get(&self.target_url).send().await {
        // Leer una pequeña parte para confirmar recepción
        let _ = resp.bytes().await; 
        let elapsed = start.elapsed();
        latencies.push(elapsed);
        println!("  Ping {}: {} ms", i, elapsed.as_millis());
      } else {
        println!("  Ping {} falló.", i);
      }
    }

    if latencies.is_empty() {
      println!("️ [KEEPER SNIFFER] Fallo crítico al calibrar red. Usando latencia por defecto (80ms).");
      return Duration::from_millis(80);
    }

    // Calcular media
    let sum: Duration = latencies.iter().sum();
    let avg_latency = sum / latencies.len() as u32;

    println!(" [KEEPER SNIFFER] Calibración exitosa. Latencia Media (RTT): {} ms", avg_latency.as_millis());
    
    // Retornar latencia en un sentido (RTT / 2) estimado
    avg_latency / 2
  }
}
