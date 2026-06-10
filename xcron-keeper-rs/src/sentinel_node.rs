use std::sync::Arc;
use crate::l1_observer::L1Observer;

/// The Sentinel Node represents a subset of Keepers dedicated to security and network integrity.
/// Sentinels do not execute tasks. They monitor the Keepers that are executing tasks
/// inside TEE Enclaves. If a Keeper halts the network or sensors transactions, 
/// the Sentinels initiate a Threshold Multi-Sig "Kill-Switch" to penalize the Keeper
/// and rescue the tasks using the 15-minute Escape Hatch.
pub struct SentinelNode {
    pub node_id: usize,
    pub threshold: usize,
    pub l1_observer: Arc<L1Observer>,
}

impl SentinelNode {
    pub fn new(node_id: usize, threshold: usize, l1_observer: Arc<L1Observer>) -> Self {
        Self {
            node_id,
            threshold,
            l1_observer,
        }
    }

    /// Monitors the TEE Enclaves and blockchain state to ensure no censorship is happening
    pub async fn monitor_protocol_health(&self) -> Result<(), String> {
        let stuck_tasks = self.l1_observer.detect_stuck_tasks().await?;
        
        if !stuck_tasks.is_empty() {
            println!(" [SENTINEL-{}] ️ ANOMALY DETECTED! {} tasks stuck beyond 15m threshold.", self.node_id, stuck_tasks.len());
            self.trigger_kill_switch().await?;
        }

        Ok(())
    }

    /// Triggers the 3-of-7 multi-sig kill switch (pause_protocol or rescueStuckXseTask)
    pub async fn trigger_kill_switch(&self) -> Result<(), String> {
        println!(" [SENTINEL-{}] Initiating Threshold Kill-Switch protocol (3-of-7 required)...", self.node_id);
        
        // P2P Coordination logic would go here to gather signatures from 2 other Sentinels
        println!(" [SENTINEL-{}] P2P Gossip: Requesting Kill-Switch Co-Signatures...", self.node_id);

        Ok(())
    }
}
