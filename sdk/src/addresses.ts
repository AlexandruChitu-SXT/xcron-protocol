/**
 * XCron Protocol SDK — Contract Addresses
 */

import { XCronAddresses, Network } from "./types";

const ADDRESSES: Record<Network, XCronAddresses> = {
    mainnet: {
        scheduler: "", // Not yet deployed
        keeperRegistry: "",
        rewards: "",
    },
    testnet: {
        scheduler: "erd1qqqqqqqqqqqqqpgqcny96vj8sesktdrqkx4e5qeujh8j7ap47k8senhrj5",
        keeperRegistry: "erd1qqqqqqqqqqqqqpgq53ffcxnes943y6s27nhynxt6y9a787f07k8se4t2ka",
        rewards: "erd1qqqqqqqqqqqqqpgq6t7um2uxapc9tk0mv4z5k68yd20a33vp7k8slmnpta",
    },
    devnet: {
        scheduler: "erd1qqqqqqqqqqqqqpgqr5qa968a8wluwshh4k7ua06z0w4t9wnu7k8sefuv72",
        keeperRegistry: "erd1qqqqqqqqqqqqqpgq0zlpshzkjr5egtaueyn29a2t9kv8mywp7k8sxexula",
        rewards: "erd1qqqqqqqqqqqqqpgqzkhxp72uzdq49dmzsng3g0tp98629k8z7k8szas8nt",
    },
};

export function getAddresses(network: Network): XCronAddresses {
    const addrs = ADDRESSES[network];
    if (!addrs.scheduler) {
        throw new Error(`XCron contracts not deployed on ${network}`);
    }
    return addrs;
}
