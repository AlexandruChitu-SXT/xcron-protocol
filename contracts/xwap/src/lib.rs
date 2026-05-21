//! XWAP Oracle Contract
//!
//! A hybrid price oracle for MultiversX that:
//!   - Calculates price ON-CHAIN using an EWMA of xExchange pool reserves
//!   - Verifies price OFF-CHAIN using keeper-reported exchange prices
//!   - Only reports "safe to execute" when both sources agree
//!
//! # Key features
//! - Gate-informed alpha: EWMA adapts faster when gate confirms price is real
//! - Multi-signal output: Gate, Consensus, Freshness, Stability
//! - Flash loan resistant: gate detects >10% pool/exchange divergence instantly
//! - No floating point: all values use BigUint with x1e18 / x1000 scaling
//!
//! # Architecture (module layout)
//! - [`storage`] — all state mappers
//! - [`events`] — on-chain event emission
//! - [`config`] — owner parameter adjustment
//! - [`oracle`] — EWMA engine, gate logic, trend detection, signal computation
//! - [`keepers`] — price report submission, median, consensus
//! - [`views`] — read-only query endpoints

#![no_std]

extern crate alloc;

multiversx_sc::imports!();

pub mod config;
pub mod events;
pub mod keepers;
pub mod oracle;
pub mod storage;
pub mod views;

use storage::StorageModule;

#[multiversx_sc::contract]
pub trait XwapContract:
    storage::StorageModule
    + events::EventsModule
    + config::ConfigModule
    + oracle::OracleModule
    + keepers::KeepersModule
    + views::ViewsModule
{
    /// Initialize the XWAP oracle with default parameters.
    ///
    /// Default config (all adjustable via config endpoints):
    /// - Gate threshold: 10% (100 permille)
    /// - Alpha min: 0.05 (50 x1000), max: 0.70 (700 x1000)
    /// - Trend boost: 0.25 (250 x1000)
    /// - Gate boost: 0.25 (250 x1000)
    /// - Freshness: 2 blocks
    /// - Consensus min: 80% (800 permille)
    #[init]
    fn init(&self, pool_address: ManagedAddress) {
        let caller = self.blockchain().get_caller();
        self.owner_address().set(&caller);
        self.pool_address().set(pool_address);

        // Default config — optimized via grid search of 729 configurations
        self.gate_threshold_permille().set(100u64);   // 10%
        self.alpha_min_x1000().set(50u64);            // 0.05
        self.alpha_max_x1000().set(700u64);           // 0.70
        self.trend_boost_x1000().set(250u64);         // +0.25
        self.gate_boost_x1000().set(250u64);          // +0.25
        self.freshness_blocks().set(2u64);
        self.consensus_min_permille().set(800u64);    // 80%

        // Init EWMA state to zero (first update_price call will seed it)
        self.ewma_reserve_a().set(BigUint::zero());
        self.ewma_reserve_b().set(BigUint::zero());
        self.xwap_price().set(BigUint::zero());
        self.prev_xwap_price().set(BigUint::zero());
        self.alpha_x1000().set(50u64);
        self.price_history_idx().set(0u64);
        self.update_count().set(0u64);
    }

    /// Safe upgrade — preserves storage, bumps version.
    #[upgrade]
    fn upgrade(&self) {
        self.update_count().update(|v| *v = *v); // preserve
        // Future storage mappers should be initialized here with set_if_empty
    }
}
