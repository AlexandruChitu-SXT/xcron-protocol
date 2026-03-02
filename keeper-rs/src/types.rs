//! Types shared across the keeper modules.

use serde::Deserialize;

/// Task status as stored in the scheduler contract.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TaskStatus {
    Pending = 0,
    Committed = 1,
    Executing = 2,
    Completed = 3,
    Failed = 4,
    Expired = 5,
}

impl TaskStatus {
    pub fn from_u8(v: u8) -> Self {
        match v {
            0 => Self::Pending,
            1 => Self::Committed,
            2 => Self::Executing,
            3 => Self::Completed,
            4 => Self::Failed,
            5 => Self::Expired,
            _ => Self::Failed,
        }
    }
}

/// A task fetched from the Scheduler contract.
#[derive(Debug, Clone)]
pub struct ScheduledTask {
    pub id: u64,
    pub owner: String,
    pub target_contract: String,
    pub target_endpoint: String,
    pub trigger_time: u64,
    pub max_gas: u64,
    pub deposit: u64, // in smallest denomination
    pub status: TaskStatus,
}

/// Result of executing a task.
#[derive(Debug)]
pub struct ExecutionResult {
    pub task_id: u64,
    pub success: bool,
    pub tx_hash: Option<String>,
    pub error: Option<String>,
}

/// Block info from WebSocket.
#[derive(Debug, Deserialize)]
pub struct BlockInfo {
    pub hash: Option<String>,
    pub nonce: Option<u64>,
    pub shard: Option<u32>,
    pub timestamp: Option<u64>,
}

/// API transaction response.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiTransaction {
    pub tx_hash: Option<String>,
    pub status: Option<String>,
    pub function: Option<String>,
    pub sender: Option<String>,
    pub receiver: Option<String>,
    pub data: Option<String>,
    pub timestamp: Option<u64>,
}

/// VM query response.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VmQueryResponse {
    pub data: Option<VmQueryData>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VmQueryData {
    pub data: Option<VmQueryResult>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VmQueryResult {
    pub return_data: Option<Vec<String>>,
    pub return_code: Option<String>,
    pub return_message: Option<String>,
}
