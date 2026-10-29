# OpenTender Architecture & Technical Specification

OpenTender is a sealed-bid public e-procurement and milestone-escrow smart contract suite engineered for high-integrity public sector and enterprise purchasing on EVM blockchains, specifically targeting the **MST Blockchain BUILDATHON #2**.

---

## 1. Core Architecture Principles

1. **Commit-Reveal Privacy**: Bids remain computationally confidential throughout the submission window. Bidders commit a cryptographic hash of their bid, salt, bidder address, tender ID, and blockchain chain ID.
2. **Conflict-of-Interest & Anti-Sybil Defense**: Corporate entities and related affiliates belonging to the same `groupId` are blocked from submitting competing bids on the same tender. Unique off-chain identity hashes (`PAN/CIN/GSTIN`) ensure one registration per legal entity.
3. **Strict Financial Solvency & O(1) Gas Scaling**: No unbounded loops over bidder arrays for refunds or bond accounting. Bidders pull their own refunds (`claimBondRefund`), and failed transfers gracefully fall back to pull-payment credits.
4. **M-of-N Multi-Verifier Milestone Escrow**: Payments are locked in on-chain escrow upon award. Verifiers inspect submitted evidence and independently sign off on milestones with a customizable approval threshold.
5. **Automated Late Delivery Penalty Engine**: Transparent, mathematically capped daily penalties (up to 10%/day) deducted automatically upon milestone approval, crediting the procuring Department.
6. **Robust Default Protection**: Insolvent or delinquent contractors defaulting past `dueDate + gracePeriod` forfeit performance bonds and are automatically debarred from future tenders. Submitted-on-time milestones are strictly protected from unfair default declarations while awaiting verifier reviews.

---

## 2. Procurement Lifecycle State Machine

```
                   [createTender]
                         │
                         ▼
                   ┌───────────┐
                   │   Open    │ (Commit Window: msg.value == bidBond)
                   └─────┬─────┘
                         │
                         ▼ (Time > commitDeadline)
                   ┌───────────┐
                   │  Reveal   │ (Reveal Window: amount, salt verified)
                   └─────┬─────┘
                         │
                         ▼ (Time > revealDeadline)
                   [finalizeAward]
                         ├─────────────────────────────────────────┐
                         │                                         │
        (Valid reveals > 0)                               (Zero valid reveals)
                         │                                         │
                         ▼                                         ▼
                   ┌───────────┐                             ┌───────────┐
                   │  Awarded  │                             │  Failed   │
                   └─────┬─────┘                             └───────────┘
                         │
         [fundEscrow]    │    (Time > escrowDeadline)
      (Winning Amount)   │       [cancelUnfundedTender]
                         ├─────────────────────────────────────────┐
                         │                                         │
                         ▼                                         ▼
                   ┌───────────┐                             ┌───────────┐
                   │  Funded   │                             │ Cancelled │
                   └─────┬─────┘                             └───────────┘
                         │
            ┌────────────┴────────────┐
            │                         │
[submitMilestone & approve]     [declareDefault]
            │               (Missed due date + grace)
            ▼                         ▼
      ┌───────────┐             ┌───────────┐
      │ Completed │             │ Defaulted │
      └───────────┘             └───────────┘
```

---

## 3. Cryptographic Commit-Reveal Protocol

### Commitment Generation
To prevent front-running, cross-contract replay, and cross-chain replay attacks, commitments are computed strictly as:

$$\text{commitHash} = \text{keccak256}(\text{abi.encode}(\text{amount}, \text{salt}, \text{bidder}, \text{tenderId}, \text{block.chainid}))$$

- **`amount`**: Exact bid price in wei.
- **`salt`**: High-entropy 32-byte secret known only to the bidder.
- **`bidder`**: Bidder wallet address (`msg.sender`). Replaying another bidder's commitment hash will cause reveal verification to fail.
- **`tenderId`**: Binds commitment to a specific tender.
- **`block.chainid`**: Eliminates cross-chain replay vulnerabilities.

---

## 4. Milestone & Penalty Mechanics

Each tender defines an array of milestones with percentage allocations summing to 10,000 basis points (100%).

### Late Delivery Penalty Formula
When a milestone is submitted late ($\text{submittedAt} > \text{dueDate}$):
$$\text{elapsedDays} = \left\lceil \frac{\text{submittedAt} - \text{dueDate}}{86400} \right\rceil$$
$$\text{penalty} = \min\left(\text{grossAmount}, \frac{\text{grossAmount} \times \text{latePenaltyRateBps} \times \text{elapsedDays}}{10000}\right)$$
$$\text{netPayout} = \text{grossAmount} - \text{penalty}$$

- **Penalty Transfer**: $\text{penalty}$ is credited or directly refunded to the Department.
- **Contractor Payout**: $\text{netPayout}$ is delivered to the contractor.
- **Precision Remainder**: For the final milestone, gross allocation equals $\text{winningAmount} - \text{totalMilestoneAllocated}$, ensuring zero wei dust loss due to integer division.
