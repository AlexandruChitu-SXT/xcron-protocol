//! XCron Common Crate
//!
//! Shared types, constants, error definitions, and reusable modules for the
//! XCron protocol (Scheduler, KeeperRegistry, Rewards).

#![no_std]

pub mod constants;
pub mod errors;
pub mod pausable;
pub mod types;
pub mod lns;
pub mod hyperbolic;
pub mod trig;
pub mod chaotic;
pub mod time;


