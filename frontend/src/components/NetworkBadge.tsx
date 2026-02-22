import { NETWORK } from '../config';

/**
 * Fixed badge showing which network the dApp is connected to.
 * Supports devnet, testnet, and mainnet.
 */
export function NetworkBadge() {
    const networkName = NETWORK.name.charAt(0).toUpperCase() + NETWORK.name.slice(1);
    const isMainnet = NETWORK.name === 'mainnet';
    const className = isMainnet ? 'network-badge network-badge--mainnet' : 'network-badge network-badge--devnet';

    return (
        <div className={className}>
            <span className="network-badge-dot" />
            {networkName}
        </div>
    );
}
