import React from "react";
import { CHAIN_NAME, CHAIN_ID, CURRENCY_SYMBOL } from "../config";

export default function Header({ account, chainId, roles, balance, onConnect, onSwitchNetwork }) {
  const isCorrectNetwork = chainId === CHAIN_ID;

  return (
    <header className="header">
      <div className="header-brand">
        <div className="brand-logo">
          <span className="logo-shield">🛡️</span>
          <div>
            <h1 className="brand-title">OpenTender: tenders nobody can rig.</h1>
            <p className="brand-sub">Sealed-Bid E-Procurement &amp; Milestone Escrow Protocol</p>
          </div>
        </div>
      </div>

      <div className="header-actions">
        {/* Network Indicator / Switcher */}
        <div className="network-pill">
          <span className={`status-dot ${isCorrectNetwork ? "online" : "warning"}`} />
          <span>{isCorrectNetwork ? CHAIN_NAME : `Wrong Network (${chainId || "Unknown"})`}</span>
          {!isCorrectNetwork && (
            <button className="btn-mini btn-switch" onClick={onSwitchNetwork}>
              Switch to {CHAIN_NAME}
            </button>
          )}
        </div>

        {/* Roles Badges */}
        {account && (
          <div className="roles-container">
            {roles.isRegistrar && <span className="badge badge-registrar">Registrar</span>}
            {roles.isDepartment && <span className="badge badge-dept">Department</span>}
            {roles.isVerifier && <span className="badge badge-verifier">Verifier</span>}
            {roles.isBidder && !roles.isDebarred && (
              <span className="badge badge-bidder">Registered Bidder</span>
            )}
            {roles.isDebarred && <span className="badge badge-debarred">Debarred</span>}
            {!roles.isRegistrar && !roles.isDepartment && !roles.isVerifier && !roles.isBidder && (
              <span className="badge badge-guest">Public Wallet</span>
            )}
          </div>
        )}

        {/* Wallet Button */}
        {account ? (
          <div className="wallet-card">
            <span className="wallet-balance">
              {parseFloat(balance || "0").toFixed(3)} {CURRENCY_SYMBOL}
            </span>
            <span className="wallet-address" title={account}>
              {account.slice(0, 6)}...{account.slice(-4)}
            </span>
          </div>
        ) : (
          <button className="btn btn-primary btn-connect" onClick={onConnect}>
            🦊 Connect MetaMask
          </button>
        )}
      </div>
    </header>
  );
}
