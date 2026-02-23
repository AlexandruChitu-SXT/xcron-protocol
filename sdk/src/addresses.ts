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
        scheduler: "erd1qqqqqqqqqqqqqpgqg49x0pq93549gt0nvds7fjaxslxc9lpt7k8sc6d263",
        keeperRegistry: "erd1qqqqqqqqqqqqqpgq53ffcxnes943y6s27nhynxt6y9a787f07k8se4t2ka",
        rewards: "erd1qqqqqqqqqqqqqpgq6t7um2uxapc9tk0mv4z5k68yd20a33vp7k8slmnpta",
    },
    devnet: {
        scheduler: "erd1qqqqqqqqqqqqqpgqsmmpmp7hh6cqrnng0vp9ywgre70luvus7k8svk7ejh",
        keeperRegistry: "",
        rewards: "",
    },
};

export function getAddresses(network: Network): XCronAddresses {
    const addrs = ADDRESSES[network];
    if (!addrs.scheduler) {
        throw new Error(`XCron contracts not deployed on ${network}`);
    }
    return addrs;
}
