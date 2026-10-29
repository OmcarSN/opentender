import React from "react";
import { EXPLORER_URL } from "../config";

export default function TxNotification({ notification, onDismiss }) {
  if (!notification || (!notification.active && !notification.error && !notification.success)) {
    return null;
  }

  const { active, title, hash, error, success } = notification;

  return (
    <div className={`tx-notification ${error ? "is-error" : success ? "is-success" : "is-pending"}`}>
      <div className="tx-icon">
        {active && <div className="spinner" />}
        {success && (
          <svg className="icon-success" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--emerald-light)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        )}
        {error && (
          <svg className="icon-error" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        )}
      </div>

      <div className="tx-content">
        <div className="tx-title">{title || (error ? "Operation Failed" : "Transaction")}</div>
        {success && <div className="tx-msg">{success}</div>}
        {error && <div className="tx-msg error-text">{error}</div>}
        {hash && (
          <div className="tx-link">
            {EXPLORER_URL ? (
              <a href={`${EXPLORER_URL}/tx/${hash}`} target="_blank" rel="noopener noreferrer">
                View on Explorer ↗
              </a>
            ) : (
              <span className="tx-hash">Tx: {hash.slice(0, 10)}...{hash.slice(-8)}</span>
            )}
          </div>
        )}
      </div>

      {!active && (
        <button className="btn-close" onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  );
}
