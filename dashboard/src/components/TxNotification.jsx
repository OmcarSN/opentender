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
        {success && <span>✅</span>}
        {error && <span>⚠️</span>}
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
