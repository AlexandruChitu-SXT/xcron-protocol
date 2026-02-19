import { NETWORK } from '../config';

/**
 * Fixed badge showing which network (Devnet/Mainnet) the dApp is connected to.
 * Includes a pulsing dot to indicate live connection.
 */
export function NetworkBadge() {
    const isDevnet = NETWORK.apiUrl.includes('devnet');
    const label = isDevnet ? 'Devnet' : 'Mainnet';
    const className = isDevnet ? 'network-badge network-badge--devnet' : 'network-badge network-badge--mainnet';

    return (
        <div className={className}>
            <span className="network-badge-dot" />
            {label}
        </div>
    );
}
