import { NavLink } from 'react-router-dom';

export function NotFound() {
    return (
        <div className="page">
            <div className="app-container">
                <div className="not-found">
                    <div className="nf-glow" />
                    <div className="nf-code">404</div>
                    <h1 className="nf-title">Page Not Found</h1>
                    <p className="nf-desc">
                        The page you're looking for doesn't exist or has been moved.
                    </p>
                    <NavLink to="/">
                        <button className="btn btn-primary" style={{ marginTop: 8, padding: '12px 28px' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <line x1="19" y1="12" x2="5" y2="12" />
                                <polyline points="12,19 5,12 12,5" />
                            </svg>
                            Back to Dashboard
                        </button>
                    </NavLink>
                </div>
            </div>
        </div>
    );
}
