# OpenTender Smart Contract Audit & Threat Model

**Contract:** `OpenTender.sol`  
**Compiler:** Solidity 0.8.24 (`viaIR: true`, 200 runs)  
**Standard:** OpenZeppelin Contracts v5.0.2  

---

## 1. Verified Audit & Test Results

The suite has been verified against Hardhat EVM with all 19 security audit and edge-case tests passing:

```
  OpenTender Smart Contract Suite & Security Audit Tests
    ✔ Peek attack: before reveal, only hashes are readable
    ✔ Edit attack: a second commit by the same bidder reverts
    ✔ Copy attack: a bidder reusing another bidder's hash fails at reveal
    ✔ Wrong salt, wrong amount, early reveal and late reveal
    ✔ Non-reveal forfeits the bond
    ✔ Tie-break by earliest commit
    ✔ Same-group bidders blocked, unregistered and debarred bidders blocked
    ✔ Award before the reveal deadline reverts, double award reverts
    ✔ Underfunded or late escrow handling
    ✔ Milestone approval below the threshold does not release funds
    ✔ Late-penalty math, including rounding, with the remainder going to the final milestone
    ✔ Default flow
    ✔ Submitted-on-time milestone cannot be defaulted
    ✔ createTender requires bidBond greater than zero
    ✔ Reentrancy attack using a malicious contract
    ✔ Access control for every restricted function
    ✔ Cancel before commit deadline refunds all committed bonds, fails after commit deadline
    ✔ Tender marked Failed when zero valid reveals exist
    ✔ Pausable emergency stop, views, and fallback pull-credit when contractor rejects ETH

  19 passing (3s)
```

### Coverage Report (`solidity-coverage`)

- **OpenTender.sol:** 93.75% statements, 58.28% branches

---

## 2. Threat Matrix & Mitigations

| Threat / Attack Vector | Vulnerability Description | Mitigation in OpenTender.sol |
|---|---|---|
| **Front-Running / Mempool Sniffing** | Miners or bots copy or undercut public bids before inclusion. | Cryptographic commit-reveal scheme. Bid amounts and salts are strictly concealed until commit deadline closes. |
| **Commitment Spoofing / Copy Attack** | Malicious bidder copies a victim's commitment hash from the mempool. | Address binding: `computeCommitHash` binds `bidder` (`msg.sender`) and `chainId`. When attacker attempts to reveal, the hash recalculation fails. |
| **Commitment Resubmission / Edit Attack** | Bidder changes bid after seeing market conditions. | State tracking via `CommitInfo.committed`. Attempting a second commit reverts with `AlreadyCommitted`. |
| **Selective Non-Reveal (Griefing)** | Losing bidder refuses to reveal to stall finalize or inspect opponents. | Strict bid bond requirement. Non-revealing bidders permanently forfeit their bond to the Department upon award finalization. |
| **Tie-Breaking Collision** | Two bidders submit identical winning amounts. | Deterministic tie-breaker: Lowest bid with the earliest recorded `commitTime` wins. |
| **Affiliate Bid Rigging / Sybil** | Related sister companies submit multiple bids to manipulate pricing. | Group conflict detection via `_groupCommitter[tenderId][groupId]`. First comitter locks the group; subsequent group members revert. |
| **Reentrancy Attacks** | Malicious contractor or bidder re-enters contract during ETH transfers. | OpenZeppelin `ReentrancyGuard` (`nonReentrant`) on all external state-changing functions + Checks-Effects-Interactions pattern. |
| **Denial of Service via Reverting Fallback** | Contractor smart contract reverts in `receive()` to permanently lock verifier payout. | `_safeTransferOrCredit` pattern: If `.call{value: amount}("")` fails, funds are safely credited to `claimableBalance` without reverting transaction. |
| **Premature / Unfair Contractor Default** | Contractor submits milestone on time, but verifiers delay approval past due date + grace period. | `declareDefault` explicitly enforces `m.status == MilestoneStatus.Pending`. Once submitted (`Submitted` status), the milestone cannot be defaulted. |
| **Integer Division & Rounding Dust** | Multi-stage milestone basis points leave tiny wei amounts trapped in escrow. | Remainder allocation on the final milestone: gross amount is calculated as `t.winningAmount - t.totalMilestoneAllocated`. |

---

## 3. Invariant Checklist

- **Solvency Invariant**: `address(this).balance >= totalVolumeLocked` at all block heights.
- **Bond Conservation**: Every committed bond is either returned to a valid revealing loser, returned to the completed contractor, or credited as a forfeit to the procuring Department.
- **Sequential Milestones**: Milestones can only be submitted in strict ascending index order (`milestoneIndex == t.completedMilestones`).
- **Verifier Quorum**: Milestone funds can never be released unless `approvalCount >= approvalThreshold`.
