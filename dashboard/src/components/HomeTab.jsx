import React from "react";

export default function HomeTab({ onNavigate }) {
  return (
    <div className="tab-pane home-tab">
      {/* Hero Section */}
      <div className="home-hero">
        <h1 className="home-headline">Government tenders nobody can rig</h1>
        <p className="home-subline">
          Bids stay sealed until the deadline, the lowest valid bid wins automatically, and payment is released only when the work is verified.
        </p>

        <div className="home-actions-row">
          <button
            type="button"
            className="btn btn-primary btn-cta"
            onClick={() => onNavigate("audit", false)}
          >
            See tenders
          </button>
          <button
            type="button"
            className="btn btn-outline btn-cta"
            onClick={() => onNavigate("audit", true)}
          >
            Try to cheat the system
          </button>
        </div>
      </div>

      {/* Four Step Cards */}
      <div className="home-steps-grid">
        <div className="home-step-card">
          <div className="step-badge">Step 1</div>
          <div className="step-card-text">
            <strong>1. Sealed bids:</strong> companies lock their price in a sealed envelope
          </div>
        </div>

        <div className="home-step-card">
          <div className="step-badge">Step 2</div>
          <div className="step-card-text">
            <strong>2. Opening:</strong> after the deadline every bid is opened and checked
          </div>
        </div>

        <div className="home-step-card">
          <div className="step-badge">Step 3</div>
          <div className="step-card-text">
            <strong>3. Automatic winner:</strong> the contract picks the lowest valid bid, nobody can override it
          </div>
        </div>

        <div className="home-step-card">
          <div className="step-badge">Step 4</div>
          <div className="step-card-text">
            <strong>4. Paid in stages:</strong> money is released only after independent verifiers approve each stage
          </div>
        </div>
      </div>

      {/* Two Column Grid: The problem & What it cannot do */}
      <div className="home-details-grid">
        {/* The problem */}
        <div className="home-card problem-card">
          <h2 className="home-section-title">The problem</h2>
          <ul className="problem-bullets">
            <li>
              <span className="bullet-icon">✖</span>
              <span>Insiders can peek at bids before the deadline</span>
            </li>
            <li>
              <span className="bullet-icon">✖</span>
              <span>Bids can be changed after they are submitted</span>
            </li>
            <li>
              <span className="bullet-icon">✖</span>
              <span>Payments can be made without finished work</span>
            </li>
          </ul>
        </div>

        {/* What it cannot do */}
        <div className="home-card limitation-card">
          <h2 className="home-section-title">What it cannot do</h2>
          <div className="limitation-box-body">
            <p>
              It cannot stop companies from agreeing prices privately outside the system. It also depends on honest registration of companies and honest verifiers.
            </p>
          </div>
        </div>
      </div>

      {/* Bottom CTA Row */}
      <div className="home-actions-row home-bottom-cta">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => onNavigate("audit", false)}
        >
          See tenders
        </button>
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => onNavigate("audit", true)}
        >
          Try to cheat the system
        </button>
      </div>
    </div>
  );
}
