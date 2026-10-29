import React, { useState } from "react";
import { ethers } from "ethers";
import { CURRENCY_SYMBOL } from "../config";
import { parseContractError } from "../utils/errors";

export default function OfficerTab({
  account,
  roles,
  signerContract,
  tenders,
  selectedTenderId,
  selectedTenderDetails,
  onRefresh,
  setNotification
}) {
  // Department: Create Tender Form State
  const [ceilingPrice, setCeilingPrice] = useState("50");
  const [bidBond, setBidBond] = useState("2");
  const [commitMins, setCommitMins] = useState("3");
  const [revealMins, setRevealMins] = useState("3");
  const [escrowHours, setEscrowHours] = useState("1");
  const [graceHours, setGraceHours] = useState("24");
  const [penaltyBps, setPenaltyBps] = useState("200");
  const [docHash, setDocHash] = useState("MST_BUILDATHON_PROCUREMENT_V1");
  const [verifiersText, setVerifiersText] = useState(
    "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC, 0x90F79bf6EB2c4f870365E785982E1f101E93b906"
  );
  const [threshold, setThreshold] = useState("2");

  // Lifecycle control state
  const [actionTenderId, setActionTenderId] = useState(selectedTenderId || 1);
  const [cancelReason, setCancelReason] = useState("Budget re-allocation");

  // Verifier state
  const [verifyTenderId, setVerifyTenderId] = useState(selectedTenderId || 1);
  const [verifyMilestoneIdx, setVerifyMilestoneIdx] = useState(0);

  // Registrar state
  const [regDeptAddress, setRegDeptAddress] = useState("");
  const [regVerifierAddress, setRegVerifierAddress] = useState("");
  const [regBidderAddress, setRegBidderAddress] = useState("");
  const [regIdentityId, setRegIdentityId] = useState("PAN_MOCK_CORP_01");
  const [regGroupId, setRegGroupId] = useState("GROUP_ALPHA");
  const [debarAddress, setDebarAddress] = useState("");
  const [debarReason, setDebarReason] = useState("Violation of procurement compliance");

  // Pre-fill demo values
  function handleFillDemo() {
    setCeilingPrice("50");
    setBidBond("2");
    setCommitMins("3");
    setRevealMins("3");
    setEscrowHours("1");
    setGraceHours("1");
    setPenaltyBps("200");
    setDocHash("LIVE_BUILDATHON_DEMO_SPEC");
    setVerifiersText("0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC, 0x90F79bf6EB2c4f870365E785982E1f101E93b906");
    setThreshold("2");
  }

  // Handle Tender Creation
  async function handleCreateTender(e) {
    e.preventDefault();
    if (!signerContract) return;

    try {
      setNotification({ active: true, title: "Creating New Tender On-Chain..." });

      const now = Math.floor(Date.now() / 1000);
      const commitDeadline = now + parseInt(commitMins, 10) * 60;
      const revealDeadline = commitDeadline + parseInt(revealMins, 10) * 60;
      const escrowWindow = parseInt(escrowHours, 10) * 3600;
      const gracePeriod = parseInt(graceHours, 10) * 3600;

      // Parse verifiers
      const verifiers = verifiersText
        .split(",")
        .map((s) => s.trim())
        .filter((s) => ethers.isAddress(s));

      if (verifiers.length === 0) {
        throw new Error("Please enter at least one valid verifier address.");
      }

      // Default to 2 milestones: 50% and 50%
      const milestones = [
        { percentageBps: 5000, dueDate: revealDeadline + 86400 * 5 },
        { percentageBps: 5000, dueDate: revealDeadline + 86400 * 10 }
      ];

      const documentHash = docHash.startsWith("0x") && docHash.length === 66
        ? docHash
        : ethers.id(docHash);

      const tx = await signerContract.createTender(
        ethers.parseEther(ceilingPrice),
        ethers.parseEther(bidBond),
        commitDeadline,
        revealDeadline,
        escrowWindow,
        gracePeriod,
        parseInt(penaltyBps, 10),
        documentHash,
        milestones,
        verifiers,
        parseInt(threshold, 10)
      );

      setNotification({ active: true, title: "Mining Tender Creation...", hash: tx.hash });
      await tx.wait();

      setNotification({
        active: false,
        hash: tx.hash,
        title: "Tender Created Successfully!",
        success: "Tender specification has been published. Sealed bid commit phase is now active."
      });
      onRefresh();
    } catch (err) {
      const msg = parseContractError(err);
      setNotification({ active: false, title: "Tender Creation Failed", error: msg });
    }
  }

  // Finalize Award
  async function handleFinalizeAward() {
    if (!signerContract) return;
    try {
      setNotification({ active: true, title: `Finalizing Award for Tender #${actionTenderId}...` });
      const tx = await signerContract.finalizeAward(actionTenderId);
      setNotification({ active: true, title: "Confirming award...", hash: tx.hash });
      await tx.wait();
      setNotification({
        active: false,
        hash: tx.hash,
        title: "Tender Finalized & Awarded",
        success: "Winning bidder determined. Non-reveal bonds forfeited to Department pull balance."
      });
      onRefresh();
    } catch (err) {
      const msg = parseContractError(err);
      setNotification({ active: false, title: "Finalization Failed", error: msg });
    }
  }

  // Fund Escrow
  async function handleFundEscrow() {
    if (!signerContract) return;
    try {
      setNotification({ active: true, title: `Funding Escrow for Tender #${actionTenderId}...` });
      const details = await signerContract.getTenderDetails(actionTenderId);
      const winningAmount = details.winningAmount;

      const tx = await signerContract.fundEscrow(actionTenderId, { value: winningAmount });
      setNotification({ active: true, title: "Locking funds in escrow...", hash: tx.hash });
      await tx.wait();
      setNotification({
        active: false,
        hash: tx.hash,
        title: "Escrow Funded!",
        success: `Successfully funded ${ethers.formatEther(winningAmount)} ${CURRENCY_SYMBOL} into smart contract escrow.`
      });
      onRefresh();
    } catch (err) {
      const msg = parseContractError(err);
      setNotification({ active: false, title: "Escrow Funding Failed", error: msg });
    }
  }

  // Cancel Tender
  async function handleCancelTender() {
    if (!signerContract) return;
    try {
      setNotification({ active: true, title: `Cancelling Tender #${actionTenderId}...` });
      const tx = await signerContract.cancelTender(actionTenderId, cancelReason);
      setNotification({ active: true, title: "Confirming cancellation...", hash: tx.hash });
      await tx.wait();
      setNotification({
        active: false,
        hash: tx.hash,
        title: "Tender Cancelled",
        success: "Tender cancelled. Committed bid bonds are now unlocked for pull refund."
      });
      onRefresh();
    } catch (err) {
      const msg = parseContractError(err);
      setNotification({ active: false, title: "Cancellation Failed", error: msg });
    }
  }

  // Declare Default
  async function handleDeclareDefault() {
    if (!signerContract) return;
    try {
      setNotification({ active: true, title: `Declaring Default on Tender #${actionTenderId}...` });
      const tx = await signerContract.declareDefault(actionTenderId);
      setNotification({ active: true, title: "Executing default...", hash: tx.hash });
      await tx.wait();
      setNotification({
        active: false,
        hash: tx.hash,
        title: "Contractor Default Declared",
        success: "Performance bond forfeited, remaining escrow recovered, contractor debarred."
      });
      onRefresh();
    } catch (err) {
      const msg = parseContractError(err);
      setNotification({ active: false, title: "Default Declaration Failed", error: msg });
    }
  }

  // Verifier: Approve Milestone
  async function handleApproveMilestone() {
    if (!signerContract) return;
    try {
      setNotification({
        active: true,
        title: `Signing Off Milestone #${verifyMilestoneIdx} for Tender #${verifyTenderId}...`
      });
      const tx = await signerContract.approveMilestone(verifyTenderId, verifyMilestoneIdx);
      setNotification({ active: true, title: "Recording verification...", hash: tx.hash });
      await tx.wait();
      setNotification({
        active: false,
        hash: tx.hash,
        title: "Milestone Approved!",
        success: "Your verifier sign-off was registered. If threshold was met, funds were automatically released."
      });
      onRefresh();
    } catch (err) {
      const msg = parseContractError(err);
      setNotification({ active: false, title: "Milestone Approval Failed", error: msg });
    }
  }

  // Registrar actions
  async function handleRegisterDepartment() {
    if (!signerContract || !regDeptAddress) return;
    try {
      setNotification({ active: true, title: "Granting DEPARTMENT_ROLE..." });
      const tx = await signerContract.registerDepartment(regDeptAddress);
      await tx.wait();
      setNotification({ active: false, title: "Department Registered", success: `Granted role to ${regDeptAddress}` });
      setRegDeptAddress("");
      onRefresh();
    } catch (err) {
      setNotification({ active: false, title: "Registration Failed", error: parseContractError(err) });
    }
  }

  async function handleRegisterVerifier() {
    if (!signerContract || !regVerifierAddress) return;
    try {
      setNotification({ active: true, title: "Granting VERIFIER_ROLE..." });
      const tx = await signerContract.registerVerifier(regVerifierAddress);
      await tx.wait();
      setNotification({ active: false, title: "Verifier Registered", success: `Granted role to ${regVerifierAddress}` });
      setRegVerifierAddress("");
      onRefresh();
    } catch (err) {
      setNotification({ active: false, title: "Registration Failed", error: parseContractError(err) });
    }
  }

  async function handleRegisterBidder() {
    if (!signerContract || !regBidderAddress) return;
    try {
      setNotification({ active: true, title: "Registering Bidder Credentials..." });
      const tx = await signerContract.registerBidder(
        regBidderAddress,
        ethers.id(regIdentityId),
        ethers.id(regGroupId)
      );
      await tx.wait();
      setNotification({
        active: false,
        title: "Bidder Registered",
        success: `Bidder ${regBidderAddress} registered with legal identity and Group: ${regGroupId}`
      });
      setRegBidderAddress("");
      onRefresh();
    } catch (err) {
      setNotification({ active: false, title: "Registration Failed", error: parseContractError(err) });
    }
  }

  async function handleDebarBidder() {
    if (!signerContract || !debarAddress) return;
    try {
      setNotification({ active: true, title: "Debarring Bidder..." });
      const tx = await signerContract.debarBidder(debarAddress, debarReason);
      await tx.wait();
      setNotification({
        active: false,
        title: "Bidder Debarred",
        success: `Wallet ${debarAddress} is now formally debarred from tender participation.`
      });
      setDebarAddress("");
      onRefresh();
    } catch (err) {
      setNotification({ active: false, title: "Debarment Failed", error: parseContractError(err) });
    }
  }

  return (
    <div className="tab-pane officer-tab">
      <div className="officer-grid">
        {/* Department: Create Tender */}
        <div className="panel">
          <div className="panel-header">
            <h3>🏛️ Department: Publish Tender</h3>
            <button type="button" className="btn-mini btn-secondary" onClick={handleFillDemo}>
              ⚡ Fill Demo Values
            </button>
          </div>

          <form onSubmit={handleCreateTender} className="form-card">
            <div className="form-row">
              <div className="form-group col-half">
                <label>Ceiling Price ({CURRENCY_SYMBOL})</label>
                <input
                  type="number"
                  step="0.01"
                  value={ceilingPrice}
                  onChange={(e) => setCeilingPrice(e.target.value)}
                  required
                />
              </div>
              <div className="form-group col-half">
                <label>Bid Bond Deposit ({CURRENCY_SYMBOL})</label>
                <input
                  type="number"
                  step="0.01"
                  value={bidBond}
                  onChange={(e) => setBidBond(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group col-half">
                <label>Commit Duration (Minutes)</label>
                <input
                  type="number"
                  min="1"
                  value={commitMins}
                  onChange={(e) => setCommitMins(e.target.value)}
                  required
                />
              </div>
              <div className="form-group col-half">
                <label>Reveal Duration (Minutes)</label>
                <input
                  type="number"
                  min="1"
                  value={revealMins}
                  onChange={(e) => setRevealMins(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group col-half">
                <label>Escrow Window (Hours)</label>
                <input
                  type="number"
                  min="1"
                  value={escrowHours}
                  onChange={(e) => setEscrowHours(e.target.value)}
                  required
                />
              </div>
              <div className="form-group col-half">
                <label>Daily Penalty (BPS: 200 = 2%/d)</label>
                <input
                  type="number"
                  min="0"
                  max="1000"
                  value={penaltyBps}
                  onChange={(e) => setPenaltyBps(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>Specification Dossier Hash / Title</label>
              <input
                type="text"
                value={docHash}
                onChange={(e) => setDocHash(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Authorized Verifiers (Comma-Separated Addresses)</label>
              <textarea
                rows="2"
                value={verifiersText}
                onChange={(e) => setVerifiersText(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Approval Threshold (M-of-N)</label>
              <input
                type="number"
                min="1"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn btn-primary btn-block">
              🚀 Publish Public Tender
            </button>
          </form>
        </div>

        {/* Department: Tender Lifecycle Execution */}
        <div className="panel">
          <div className="panel-header">
            <h3>⚙️ Department: Tender Lifecycle Control</h3>
            <span className="badge badge-dept">Department Role</span>
          </div>

          <div className="form-card">
            <div className="form-group">
              <label>Select Target Tender</label>
              <select
                value={actionTenderId}
                onChange={(e) => setActionTenderId(Number(e.target.value))}
              >
                {tenders.map((t) => (
                  <option key={t.id} value={t.id}>
                    Tender #{t.id} (Status: {t.status})
                  </option>
                ))}
              </select>
            </div>

            <div className="lifecycle-actions-stack">
              {/* Finalize Award */}
              <div className="action-row">
                <div>
                  <strong>Finalize Award (Post-Reveal)</strong>
                  <p className="field-hint">Evaluates lowest valid bid, assigns contractor, forfeits unrevealed bonds.</p>
                </div>
                <button type="button" className="btn btn-outline" onClick={handleFinalizeAward}>
                  Finalize Award
                </button>
              </div>

              {/* Fund Escrow */}
              <div className="action-row">
                <div>
                  <strong>Fund Contract Escrow</strong>
                  <p className="field-hint">Transfers winning tender price into locked milestone escrow.</p>
                </div>
                <button type="button" className="btn btn-primary" onClick={handleFundEscrow}>
                  Fund Escrow
                </button>
              </div>

              {/* Cancel Tender */}
              <div className="action-row">
                <div>
                  <strong>Cancel Tender (Before Commit Closes)</strong>
                  <p className="field-hint">Cancels tender and releases all committed bid bonds for refund.</p>
                </div>
                <button type="button" className="btn btn-warning" onClick={handleCancelTender}>
                  Cancel Tender
                </button>
              </div>

              {/* Declare Default */}
              <div className="action-row">
                <div>
                  <strong>Declare Contractor Default</strong>
                  <p className="field-hint">
                    Enforces default if pending milestone passes due date + grace period. Reverts if milestone was submitted.
                  </p>
                </div>
                <button type="button" className="btn btn-danger" onClick={handleDeclareDefault}>
                  Declare Default
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Verifier & Registrar Sections */}
      <div className="officer-grid secondary-officer-grid">
        {/* Verifier Panel */}
        <div className="panel">
          <div className="panel-header">
            <h3>🔍 Verifier: Milestone Sign-Off</h3>
            <span className="badge badge-verifier">Verifier Role</span>
          </div>

          <div className="form-card">
            <p className="field-hint">
              Engineers and auditors verify delivered completion proofs. Reaching the approval threshold releases milestone payout and auto-deducts late delivery penalties.
            </p>
            <div className="form-row">
              <div className="form-group col-half">
                <label>Tender ID</label>
                <select
                  value={verifyTenderId}
                  onChange={(e) => setVerifyTenderId(Number(e.target.value))}
                >
                  {tenders.map((t) => (
                    <option key={t.id} value={t.id}>
                      Tender #{t.id}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group col-half">
                <label>Milestone Index</label>
                <input
                  type="number"
                  min="0"
                  value={verifyMilestoneIdx}
                  onChange={(e) => setVerifyMilestoneIdx(parseInt(e.target.value, 10))}
                />
              </div>
            </div>

            <button type="button" className="btn btn-success btn-block" onClick={handleApproveMilestone}>
              ✍️ Sign Off Milestone Approval
            </button>
          </div>
        </div>

        {/* Registrar Panel */}
        <div className="panel">
          <div className="panel-header">
            <h3>⚖️ Registrar: Participant Governance</h3>
            <span className="badge badge-registrar">Registrar Role</span>
          </div>

          <div className="form-card registrar-controls">
            {/* Register Department */}
            <div className="inline-reg-row">
              <input
                type="text"
                placeholder="Department Wallet Address"
                value={regDeptAddress}
                onChange={(e) => setRegDeptAddress(e.target.value)}
              />
              <button type="button" className="btn btn-outline" onClick={handleRegisterDepartment}>
                Grant Department
              </button>
            </div>

            {/* Register Verifier */}
            <div className="inline-reg-row">
              <input
                type="text"
                placeholder="Verifier Wallet Address"
                value={regVerifierAddress}
                onChange={(e) => setRegVerifierAddress(e.target.value)}
              />
              <button type="button" className="btn btn-outline" onClick={handleRegisterVerifier}>
                Grant Verifier
              </button>
            </div>

            {/* Register Bidder with Group ID */}
            <div className="bidder-reg-box">
              <label>Register Authorized Bidder (with Sybil Group Anti-Collusion ID):</label>
              <div className="form-row">
                <input
                  type="text"
                  placeholder="Bidder Address (0x...)"
                  value={regBidderAddress}
                  onChange={(e) => setRegBidderAddress(e.target.value)}
                />
                <input
                  type="text"
                  placeholder="Group ID (e.g. GROUP_ALPHA)"
                  value={regGroupId}
                  onChange={(e) => setRegGroupId(e.target.value)}
                />
              </div>
              <button type="button" className="btn btn-outline btn-block" onClick={handleRegisterBidder}>
                Register Bidder &amp; Anti-Sybil Group
              </button>
            </div>

            {/* Debar Bidder */}
            <div className="inline-reg-row debar-row">
              <input
                type="text"
                placeholder="Debar Bidder Address"
                value={debarAddress}
                onChange={(e) => setDebarAddress(e.target.value)}
              />
              <button type="button" className="btn btn-danger" onClick={handleDebarBidder}>
                Debar Bidder
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
