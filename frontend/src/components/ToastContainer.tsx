import { useWallet } from '../hooks/useWallet';

/**
 * Toast notification stack — renders in bottom-right corner.
 * Auto-dismisses after 5s, with manual close button.
 */
export function ToastContainer() {
    const { toasts, removeToast } = useWallet();

    if (toasts.length === 0) return null;

    return (
        <div className="toast-container">
            {toasts.map((toast) => (
                <div key={toast.id} className={`toast toast-${toast.type}`}>
                    <span className="toast-icon">
                        {toast.type === 'success' ? '✅' : toast.type === 'error' ? '❌' : 'ℹ️'}
                    </span>
                    <span className="toast-message">{toast.message}</span>
                    <button className="toast-close" onClick={() => removeToast(toast.id)}>
                        ×
                    </button>
                </div>
            ))}
        </div>
    );
}
