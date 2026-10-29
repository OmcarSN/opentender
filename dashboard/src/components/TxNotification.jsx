import React, { useEffect, useState, useRef } from "react";
import { EXPLORER_URL } from "../config";

const AUTO_DISMISS_DURATION = 4500; // 4.5 seconds

export default function TxNotification({ notification, onDismiss }) {
  const [isExiting, setIsExiting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const remainingTimeRef = useRef(AUTO_DISMISS_DURATION);

  const hasNotification = Boolean(
    notification && (notification.active || notification.error || notification.success)
  );

  const { active, title, hash, error, success } = notification || {};

  // Status priority: error > success > pending
  const isError = Boolean(error);
  const isSuccess = Boolean(!isError && success);
  const isPending = Boolean(!isError && !isSuccess && active);

  // Trigger dismiss with smooth exit animation
  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => {
      setIsExiting(false);
      if (onDismiss) onDismiss();
    }, 240);
  };

  // Auto-dismiss countdown for finished states (error or success)
  useEffect(() => {
    if (!hasNotification || isPending) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    // Reset timer when notification changes
    setIsExiting(false);
    remainingTimeRef.current = AUTO_DISMISS_DURATION;
    startTimeRef.current = Date.now();

    const startTimer = () => {
      timerRef.current = setTimeout(() => {
        handleDismiss();
      }, remainingTimeRef.current);
    };

    startTimer();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [hasNotification, isPending, error, success, title, hash]);

  // Handle pause on hover
  const handleMouseEnter = () => {
    if (isPending || !hasNotification) return;
    setIsPaused(true);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      const elapsed = Date.now() - (startTimeRef.current || Date.now());
      remainingTimeRef.current = Math.max(500, remainingTimeRef.current - elapsed);
    }
  };

  const handleMouseLeave = () => {
    if (isPending || !hasNotification) return;
    setIsPaused(false);
    startTimeRef.current = Date.now();
    timerRef.current = setTimeout(() => {
      handleDismiss();
    }, remainingTimeRef.current);
  };

  if (!hasNotification) {
    return null;
  }

  const statusClass = isError ? "is-error" : isSuccess ? "is-success" : "is-pending";

  return (
    <div
      className={`tx-toast ${statusClass} ${isExiting ? "is-exiting" : ""} ${isPaused ? "is-paused" : ""}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      role="alert"
      aria-live="polite"
    >
      <div className="tx-toast-icon-wrap">
        {isPending && (
          <div className="tx-spinner" aria-label="Processing transaction">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle
                cx="12"
                cy="12"
                r="9.5"
                strokeWidth="2.5"
                stroke="currentColor"
                strokeOpacity="0.2"
              />
              <path
                d="M12 2.5 A 9.5 9.5 0 0 1 21.5 12"
                strokeWidth="2.5"
                strokeLinecap="round"
                stroke="currentColor"
              />
            </svg>
          </div>
        )}

        {isSuccess && (
          <div className="tx-status-badge success-badge">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        )}

        {isError && (
          <div className="tx-status-badge error-badge">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
        )}
      </div>

      <div className="tx-toast-body">
        <div className="tx-toast-header">
          <span className="tx-toast-title">
            {title || (isError ? "Operation Failed" : isSuccess ? "Success" : "Processing...")}
          </span>
          <button
            className="tx-toast-close"
            onClick={handleDismiss}
            aria-label="Dismiss notification"
            type="button"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {error && <p className="tx-toast-desc error-text">{error}</p>}
        {success && <p className="tx-toast-desc">{success}</p>}

        {hash && (
          <div className="tx-toast-action">
            {EXPLORER_URL ? (
              <a
                href={`${EXPLORER_URL}/tx/${hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="tx-explorer-btn"
              >
                <span>View on Explorer</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
            ) : (
              <span className="tx-toast-hash">Tx: {hash.slice(0, 10)}...{hash.slice(-8)}</span>
            )}
          </div>
        )}
      </div>

      {/* Auto-dismiss countdown bar for error & success states */}
      {(isError || isSuccess) && (
        <div className="tx-toast-timer-bar">
          <div
            className="tx-toast-timer-fill"
            style={{
              animationDuration: `${AUTO_DISMISS_DURATION}ms`
            }}
          />
        </div>
      )}
    </div>
  );
}
