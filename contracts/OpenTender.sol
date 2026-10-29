// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title OpenTender
 * @author Senior Solidity Engineer & Auditor (MST Blockchain BUILDATHON #2)
 * @notice Sealed-bid public e-procurement and milestone-escrow smart contract.
 * @dev Implements commit-reveal sealed bidding, conflict-of-interest group blocking,
 *      O(1) bond accounting, pull-payment refunds, multi-verifier milestone payouts
 *      with automatic late-delivery penalty deductions, and contractor default handling.
 */
contract OpenTender is AccessControl, ReentrancyGuard, Pausable {
    // =============================================================
    //                           CONSTANTS & ROLES
    // =============================================================

    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");
    bytes32 public constant DEPARTMENT_ROLE = keccak256("DEPARTMENT_ROLE");
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");

    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant MAX_DAILY_PENALTY_BPS = 1_000; // 10% per day max

    // =============================================================
    //                               ENUMS
    // =============================================================

    enum TenderStatus {
        None,
        Open,       // Created; encompasses Commit and Reveal windows by timestamp
        Awarded,    // Finalized after reveal; awaiting Department escrow funding
        Funded,     // Escrow funded; contractor executing milestones
        Completed,  // All milestones verified and paid
        Failed,     // Zero valid reveals at finalize
        Cancelled,  // Cancelled before commit deadline or escrow funding timed out
        Defaulted   // Contractor missed milestone deadline + grace period
    }

    enum MilestoneStatus {
        Pending,
        Submitted,
        Approved
    }

    // =============================================================
    //                              STRUCTS
    // =============================================================

    struct BidderInfo {
        bool registered;
        bool debarred;
        bytes32 identityHash;
        bytes32 groupId;
        uint64 registeredAt;
    }

    struct MilestoneInput {
        uint16 percentageBps;
        uint64 dueDate;
    }

    struct Milestone {
        uint16 percentageBps;
        uint64 dueDate;
        uint64 submittedAt;
        bytes32 evidenceHash;
        uint16 approvalCount;
        MilestoneStatus status;
        uint256 payoutAmount;
        uint256 penaltyDeducted;
    }

    struct CommitInfo {
        bytes32 commitHash;
        uint64 commitTime;
        uint256 revealedAmount;
        bool committed;
        bool revealed;
        bool valid;
        bool bondClaimed;
    }

    struct RevealedBidView {
        address bidder;
        uint256 amount;
        uint64 commitTime;
        bool valid;
    }

    struct Tender {
        uint256 id;
        address department;
        uint256 ceilingPrice;
        uint256 bidBond;
        uint64 commitDeadline;
        uint64 revealDeadline;
        uint64 escrowDeadline;
        uint64 gracePeriod;
        uint16 latePenaltyRateBps;
        uint16 approvalThreshold;
        bytes32 documentHash;
        TenderStatus status;
        address winningBidder;
        uint256 winningAmount;
        uint64 winningCommitTime;
        uint256 totalCommits;
        uint256 validRevealsCount;
        uint256 totalBondsCommitted;
        uint256 validRevealedBondsTotal;
        uint256 escrowBalance;
        uint256 totalMilestoneAllocated;
        uint256 completedMilestones;
        bool performanceBondReleased;
    }

    // =============================================================
    //                           CUSTOM ERRORS
    // =============================================================

    error ZeroAddress();
    error InvalidIdentityHash();
    error InvalidGroupId();
    error BidderAlreadyRegistered(address bidder);
    error IdentityAlreadyRegistered(bytes32 identityHash);
    error BidderNotRegistered(address bidder);
    error BidderIsDebarred(address bidder);
    error InvalidDeadlines();
    error InvalidCeilingPrice();
    error InvalidBidBond();
    error InvalidPenaltyRate(uint16 provided);
    error InvalidVerifierConfig();
    error InvalidMilestonesConfig();
    error TenderNotFound(uint256 tenderId);
    error InvalidTenderStatus(TenderStatus current, TenderStatus expected);
    error CommitPhaseClosed(uint64 nowTime, uint64 commitDeadline);
    error RevealPhaseNotActive(uint64 nowTime, uint64 commitDeadline, uint64 revealDeadline);
    error RevealPhaseNotEnded(uint64 nowTime, uint64 revealDeadline);
    error AlreadyCommitted(address bidder);
    error GroupConflictDetected(bytes32 groupId, address existingBidder);
    error IncorrectBidBond(uint256 sent, uint256 required);
    error NoCommitFound(address bidder);
    error AlreadyRevealed(address bidder);
    error CommitHashMismatch(bytes32 expected, bytes32 actual);
    error BidExceedsCeiling(uint256 amount, uint256 ceiling);
    error NotTenderDepartment(address caller, address department);
    error EscrowWindowExpired(uint64 nowTime, uint64 escrowDeadline);
    error EscrowWindowNotExpired(uint64 nowTime, uint64 escrowDeadline);
    error IncorrectEscrowAmount(uint256 sent, uint256 required);
    error NotWinningContractor(address caller, address winner);
    error InvalidMilestoneIndex(uint256 index, uint256 count);
    error PreviousMilestoneNotApproved(uint256 index);
    error MilestoneAlreadySubmitted(uint256 index);
    error MilestoneNotSubmitted(uint256 index);
    error MilestoneAlreadyApproved(uint256 index);
    error MilestoneNotPending(uint256 index, MilestoneStatus current);
    error NotAuthorizedVerifier(address caller);
    error AlreadyApprovedMilestone(address verifier, uint256 index);
    error InvalidEvidenceHash();
    error GracePeriodNotExpired(uint64 nowTime, uint64 defaultEligibleTime);
    error CancelWindowClosed(uint64 nowTime, uint64 commitDeadline);
    error BondNotRefundable();
    error BondAlreadyClaimed();
    error NothingToWithdraw();
    error NativeTransferFailed();
    error BidsNotYetPublic(uint64 nowTime, uint64 revealDeadline);

    // =============================================================
    //                               EVENTS
    // =============================================================

    event DepartmentRegistered(address indexed department, address indexed registrar);
    event VerifierRegistered(address indexed verifier, address indexed registrar);
    event BidderRegistered(
        address indexed bidder,
        bytes32 indexed identityHash,
        bytes32 indexed groupId
    );
    event BidderDebarred(address indexed bidder, string reason);
    event BidderReinstated(address indexed bidder);

    event TenderCreated(
        uint256 indexed tenderId,
        address indexed department,
        uint256 ceilingPrice,
        uint256 bidBond,
        uint64 commitDeadline,
        uint64 revealDeadline,
        bytes32 documentHash
    );
    event BidCommitted(
        uint256 indexed tenderId,
        address indexed bidder,
        bytes32 commitHash,
        uint64 commitTime
    );
    event BidRevealed(
        uint256 indexed tenderId,
        address indexed bidder,
        uint256 amount,
        uint64 commitTime
    );
    event TenderAwarded(
        uint256 indexed tenderId,
        address indexed winner,
        uint256 winningAmount,
        uint256 forfeitedBonds
    );
    event TenderFailed(uint256 indexed tenderId, uint256 forfeitedBonds);
    event TenderCancelled(uint256 indexed tenderId, string reason);
    event EscrowFunded(uint256 indexed tenderId, address indexed department, uint256 amount);
    event MilestoneSubmitted(
        uint256 indexed tenderId,
        uint256 indexed milestoneIndex,
        bytes32 evidenceHash,
        uint64 submittedAt
    );
    event MilestoneApproved(
        uint256 indexed tenderId,
        uint256 indexed milestoneIndex,
        address indexed verifier,
        uint16 approvalCount
    );
    event MilestoneReleased(
        uint256 indexed tenderId,
        uint256 indexed milestoneIndex,
        address indexed contractor,
        uint256 netPayout,
        uint256 penaltyAmount,
        uint256 bondReturned
    );
    event TenderCompleted(uint256 indexed tenderId, address indexed contractor);
    event TenderDefaulted(
        uint256 indexed tenderId,
        address indexed contractor,
        uint256 escrowReturned,
        uint256 performanceBondForfeited
    );
    event BondRefundClaimed(
        uint256 indexed tenderId,
        address indexed bidder,
        uint256 amount
    );
    event BalanceCredited(address indexed account, uint256 amount, string reason);
    event BalanceWithdrawn(address indexed account, uint256 amount);

    // =============================================================
    //                           STATE VARIABLES
    // =============================================================

    uint256 public tenderCount;
    uint256 public totalRegisteredBidders;
    uint256 public totalDebarredBidders;
    uint256 public totalAwardedTenders;
    uint256 public totalCompletedTenders;
    uint256 public totalDefaultedTenders;
    uint256 public totalVolumeLocked;

    mapping(address => BidderInfo) private _bidders;
    mapping(bytes32 => bool) public usedIdentityHashes;

    mapping(uint256 => Tender) private _tenders;
    mapping(uint256 => Milestone[]) private _tenderMilestones;
    mapping(uint256 => address[]) private _tenderVerifiers;
    mapping(uint256 => mapping(address => bool)) private _isTenderVerifier;
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) private _milestoneApprovals;

    mapping(uint256 => mapping(address => CommitInfo)) private _commits;
    mapping(uint256 => mapping(bytes32 => address)) private _groupCommitter;
    mapping(uint256 => RevealedBidView[]) private _revealedBidsList;

    // Pull-payment ledger for milestone payouts, penalties, forfeited bonds, and refunds
    mapping(address => uint256) public claimableBalance;

    // =============================================================
    //                             CONSTRUCTOR
    // =============================================================

    constructor(address initialRegistrar) {
        if (initialRegistrar == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, initialRegistrar);
        _grantRole(REGISTRAR_ROLE, initialRegistrar);
    }

    // =============================================================
    //                     1. REGISTRAR & ROLES
    // =============================================================

    /**
     * @notice Grants DEPARTMENT_ROLE to a government department wallet.
     * @param department Wallet address of the department.
     */
    function registerDepartment(address department) external onlyRole(REGISTRAR_ROLE) {
        if (department == address(0)) revert ZeroAddress();
        _grantRole(DEPARTMENT_ROLE, department);
        emit DepartmentRegistered(department, msg.sender);
    }

    /**
     * @notice Grants VERIFIER_ROLE to an engineer/auditor wallet.
     * @param verifier Wallet address of the verifier.
     */
    function registerVerifier(address verifier) external onlyRole(REGISTRAR_ROLE) {
        if (verifier == address(0)) revert ZeroAddress();
        _grantRole(VERIFIER_ROLE, verifier);
        emit VerifierRegistered(verifier, msg.sender);
    }

    /**
     * @notice Registers a bidder wallet with a unique identity hash and related-party group ID.
     * @param bidder Address of the bidder wallet.
     * @param identityHash Keccak256 hash of off-chain legal identity (PAN/CIN/GSTIN).
     * @param groupId Related-party corporate group identifier.
     */
    function registerBidder(
        address bidder,
        bytes32 identityHash,
        bytes32 groupId
    ) external onlyRole(REGISTRAR_ROLE) {
        if (bidder == address(0)) revert ZeroAddress();
        if (identityHash == bytes32(0)) revert InvalidIdentityHash();
        if (groupId == bytes32(0)) revert InvalidGroupId();
        if (_bidders[bidder].registered) revert BidderAlreadyRegistered(bidder);
        if (usedIdentityHashes[identityHash]) revert IdentityAlreadyRegistered(identityHash);

        usedIdentityHashes[identityHash] = true;
        _bidders[bidder] = BidderInfo({
            registered: true,
            debarred: false,
            identityHash: identityHash,
            groupId: groupId,
            registeredAt: uint64(block.timestamp)
        });

        unchecked {
            ++totalRegisteredBidders;
        }

        emit BidderRegistered(bidder, identityHash, groupId);
    }

    /**
     * @notice Debars a registered bidder from participating in tenders.
     * @param bidder Address of the bidder to debar.
     * @param reason Public audit reason for debarment.
     */
    function debarBidder(address bidder, string calldata reason) external onlyRole(REGISTRAR_ROLE) {
        BidderInfo storage info = _bidders[bidder];
        if (!info.registered) revert BidderNotRegistered(bidder);
        if (!info.debarred) {
            info.debarred = true;
            unchecked {
                ++totalDebarredBidders;
            }
            emit BidderDebarred(bidder, reason);
        }
    }

    /**
     * @notice Reinstates a previously debarred bidder.
     * @param bidder Address of the bidder to reinstate.
     */
    function reinstateBidder(address bidder) external onlyRole(REGISTRAR_ROLE) {
        BidderInfo storage info = _bidders[bidder];
        if (!info.registered) revert BidderNotRegistered(bidder);
        if (info.debarred) {
            info.debarred = false;
            unchecked {
                --totalDebarredBidders;
            }
            emit BidderReinstated(bidder);
        }
    }

    /**
     * @notice Pauses state-changing procurement operations in emergencies.
     */
    function pause() external onlyRole(REGISTRAR_ROLE) {
        _pause();
    }

    /**
     * @notice Unpauses contract operations.
     */
    function unpause() external onlyRole(REGISTRAR_ROLE) {
        _unpause();
    }

    // =============================================================
    //                       2. TENDER CREATION
    // =============================================================

    /**
     * @notice Creates a new public tender with milestones and verifiers.
     * @param ceilingPrice Maximum acceptable bid in native token wei.
     * @param bidBond Required bid bond deposit in wei (must be greater than 0).
     * @param commitDeadline Unix timestamp when commit phase closes.
     * @param revealDeadline Unix timestamp when reveal phase closes.
     * @param escrowWindow Duration in seconds after award for Department to fund escrow.
     * @param gracePeriod Duration in seconds after a milestone dueDate before default is allowed.
     * @param latePenaltyRateBps Daily penalty in basis points (capped at 1000 = 10%/day).
     * @param documentHash IPFS/SHA256 hash of the tender specification dossier.
     * @param milestones Array of MilestoneInput (percentageBps summing to 10000 and dueDates).
     * @param verifiers Array of authorized verifier addresses for this tender.
     * @param approvalThreshold M-of-N approvals required per milestone.
     * @return tenderId Newly created tender ID.
     */
    function createTender(
        uint256 ceilingPrice,
        uint256 bidBond,
        uint64 commitDeadline,
        uint64 revealDeadline,
        uint64 escrowWindow,
        uint64 gracePeriod,
        uint16 latePenaltyRateBps,
        bytes32 documentHash,
        MilestoneInput[] calldata milestones,
        address[] calldata verifiers,
        uint16 approvalThreshold
    ) external onlyRole(DEPARTMENT_ROLE) whenNotPaused returns (uint256 tenderId) {
        if (ceilingPrice == 0) revert InvalidCeilingPrice();
        if (bidBond == 0) revert InvalidBidBond();
        if (
            commitDeadline <= block.timestamp ||
            revealDeadline <= commitDeadline ||
            escrowWindow == 0 ||
            gracePeriod == 0 ||
            documentHash == bytes32(0)
        ) revert InvalidDeadlines();
        if (latePenaltyRateBps > MAX_DAILY_PENALTY_BPS) {
            revert InvalidPenaltyRate(latePenaltyRateBps);
        }
        if (
            verifiers.length == 0 ||
            approvalThreshold == 0 ||
            approvalThreshold > verifiers.length
        ) revert InvalidVerifierConfig();
        if (milestones.length == 0) revert InvalidMilestonesConfig();

        tenderId = ++tenderCount;

        // Validate and store verifiers
        for (uint256 i = 0; i < verifiers.length; ++i) {
            address v = verifiers[i];
            if (v == address(0) || !hasRole(VERIFIER_ROLE, v) || _isTenderVerifier[tenderId][v]) {
                revert InvalidVerifierConfig();
            }
            _isTenderVerifier[tenderId][v] = true;
            _tenderVerifiers[tenderId].push(v);
        }

        // Validate and store milestones
        uint256 totalBps = 0;
        uint64 prevDue = revealDeadline;
        for (uint256 i = 0; i < milestones.length; ++i) {
            if (milestones[i].percentageBps == 0 || milestones[i].dueDate <= prevDue) {
                revert InvalidMilestonesConfig();
            }
            totalBps += milestones[i].percentageBps;
            prevDue = milestones[i].dueDate;

            _tenderMilestones[tenderId].push(
                Milestone({
                    percentageBps: milestones[i].percentageBps,
                    dueDate: milestones[i].dueDate,
                    submittedAt: 0,
                    evidenceHash: bytes32(0),
                    approvalCount: 0,
                    status: MilestoneStatus.Pending,
                    payoutAmount: 0,
                    penaltyDeducted: 0
                })
            );
        }
        if (totalBps != BPS_DENOMINATOR) revert InvalidMilestonesConfig();

        _tenders[tenderId] = Tender({
            id: tenderId,
            department: msg.sender,
            ceilingPrice: ceilingPrice,
            bidBond: bidBond,
            commitDeadline: commitDeadline,
            revealDeadline: revealDeadline,
            escrowDeadline: revealDeadline + escrowWindow,
            gracePeriod: gracePeriod,
            latePenaltyRateBps: latePenaltyRateBps,
            approvalThreshold: approvalThreshold,
            documentHash: documentHash,
            status: TenderStatus.Open,
            winningBidder: address(0),
            winningAmount: type(uint256).max,
            winningCommitTime: type(uint64).max,
            totalCommits: 0,
            validRevealsCount: 0,
            totalBondsCommitted: 0,
            validRevealedBondsTotal: 0,
            escrowBalance: 0,
            totalMilestoneAllocated: 0,
            completedMilestones: 0,
            performanceBondReleased: false
        });

        emit TenderCreated(
            tenderId,
            msg.sender,
            ceilingPrice,
            bidBond,
            commitDeadline,
            revealDeadline,
            documentHash
        );
    }

    // =============================================================
    //                    3. COMMIT & REVEAL PHASES
    // =============================================================

    /**
     * @notice Submits a sealed bid commitment along with the exact bid bond.
     * @dev Commit hash must be keccak256(abi.encode(amount, salt, bidder, tenderId, block.chainid)).
     * @param tenderId ID of the tender.
     * @param commitHash Sealed commitment hash.
     */
    function commitBid(
        uint256 tenderId,
        bytes32 commitHash
    ) external payable nonReentrant whenNotPaused {
        Tender storage t = _getTender(tenderId);
        if (t.status != TenderStatus.Open) {
            revert InvalidTenderStatus(t.status, TenderStatus.Open);
        }
        if (block.timestamp > t.commitDeadline) {
            revert CommitPhaseClosed(uint64(block.timestamp), t.commitDeadline);
        }
        if (commitHash == bytes32(0)) revert CommitHashMismatch(bytes32(0), bytes32(0));

        BidderInfo storage bidder = _bidders[msg.sender];
        if (!bidder.registered) revert BidderNotRegistered(msg.sender);
        if (bidder.debarred) revert BidderIsDebarred(msg.sender);

        CommitInfo storage c = _commits[tenderId][msg.sender];
        if (c.committed) revert AlreadyCommitted(msg.sender);

        address existingGroupBidder = _groupCommitter[tenderId][bidder.groupId];
        if (existingGroupBidder != address(0)) {
            revert GroupConflictDetected(bidder.groupId, existingGroupBidder);
        }

        if (msg.value != t.bidBond) {
            revert IncorrectBidBond(msg.value, t.bidBond);
        }

        _groupCommitter[tenderId][bidder.groupId] = msg.sender;
        uint64 nowTime = uint64(block.timestamp);

        c.commitHash = commitHash;
        c.commitTime = nowTime;
        c.committed = true;

        unchecked {
            ++t.totalCommits;
        }
        t.totalBondsCommitted += msg.value;
        totalVolumeLocked += msg.value;

        emit BidCommitted(tenderId, msg.sender, commitHash, nowTime);
    }

    /**
     * @notice Reveals a previously committed bid during the reveal window.
     * @param tenderId ID of the tender.
     * @param amount Bid price in wei.
     * @param salt Secret 32-byte salt used in the commitment.
     */
    function revealBid(
        uint256 tenderId,
        uint256 amount,
        bytes32 salt
    ) external nonReentrant whenNotPaused {
        Tender storage t = _getTender(tenderId);
        if (t.status != TenderStatus.Open) {
            revert InvalidTenderStatus(t.status, TenderStatus.Open);
        }
        if (block.timestamp <= t.commitDeadline || block.timestamp > t.revealDeadline) {
            revert RevealPhaseNotActive(
                uint64(block.timestamp),
                t.commitDeadline,
                t.revealDeadline
            );
        }

        BidderInfo storage bidder = _bidders[msg.sender];
        if (bidder.debarred) revert BidderIsDebarred(msg.sender);

        CommitInfo storage c = _commits[tenderId][msg.sender];
        if (!c.committed) revert NoCommitFound(msg.sender);
        if (c.revealed) revert AlreadyRevealed(msg.sender);

        bytes32 expectedHash = computeCommitHash(
            amount,
            salt,
            msg.sender,
            tenderId,
            block.chainid
        );
        if (expectedHash != c.commitHash) {
            revert CommitHashMismatch(c.commitHash, expectedHash);
        }
        if (amount == 0 || amount > t.ceilingPrice) {
            revert BidExceedsCeiling(amount, t.ceilingPrice);
        }

        c.revealed = true;
        c.valid = true;
        c.revealedAmount = amount;

        unchecked {
            ++t.validRevealsCount;
        }
        t.validRevealedBondsTotal += t.bidBond;

        _revealedBidsList[tenderId].push(
            RevealedBidView({
                bidder: msg.sender,
                amount: amount,
                commitTime: c.commitTime,
                valid: true
            })
        );

        // Incremental lowest bid evaluation (Tie-breaker: earliest commitTime wins)
        if (
            amount < t.winningAmount ||
            (amount == t.winningAmount && c.commitTime < t.winningCommitTime)
        ) {
            t.winningBidder = msg.sender;
            t.winningAmount = amount;
            t.winningCommitTime = c.commitTime;
        }

        emit BidRevealed(tenderId, msg.sender, amount, c.commitTime);
    }

    // =============================================================
    //                    4. AWARD, ESCROW & CANCEL
    // =============================================================

    /**
     * @notice Finalizes the tender after the reveal deadline. Anyone can call.
     * @dev Lowest valid bid wins. Non-reveal bonds are forfeited to the Department.
     *      Losers' bonds become claimable via claimBondRefund().
     * @param tenderId ID of the tender.
     */
    function finalizeAward(uint256 tenderId) external nonReentrant whenNotPaused {
        Tender storage t = _getTender(tenderId);
        if (t.status != TenderStatus.Open) {
            revert InvalidTenderStatus(t.status, TenderStatus.Open);
        }
        if (block.timestamp <= t.revealDeadline) {
            revert RevealPhaseNotEnded(uint64(block.timestamp), t.revealDeadline);
        }

        uint256 forfeitedBonds = t.totalBondsCommitted - t.validRevealedBondsTotal;
        if (forfeitedBonds > 0) {
            _creditBalance(t.department, forfeitedBonds, "Forfeited non-reveal bonds");
        }

        if (t.validRevealsCount == 0 || t.winningBidder == address(0)) {
            t.status = TenderStatus.Failed;
            emit TenderFailed(tenderId, forfeitedBonds);
            return;
        }

        t.status = TenderStatus.Awarded;
        t.escrowDeadline = uint64(block.timestamp) + (t.escrowDeadline - t.revealDeadline);

        unchecked {
            ++totalAwardedTenders;
        }

        emit TenderAwarded(tenderId, t.winningBidder, t.winningAmount, forfeitedBonds);
    }

    /**
     * @notice Department funds the exact winning bid amount into escrow within the funding window.
     * @param tenderId ID of the tender.
     */
    function fundEscrow(uint256 tenderId) external payable nonReentrant whenNotPaused {
        Tender storage t = _getTender(tenderId);
        if (msg.sender != t.department) {
            revert NotTenderDepartment(msg.sender, t.department);
        }
        if (t.status != TenderStatus.Awarded) {
            revert InvalidTenderStatus(t.status, TenderStatus.Awarded);
        }
        if (block.timestamp > t.escrowDeadline) {
            revert EscrowWindowExpired(uint64(block.timestamp), t.escrowDeadline);
        }
        if (msg.value != t.winningAmount) {
            revert IncorrectEscrowAmount(msg.value, t.winningAmount);
        }

        t.status = TenderStatus.Funded;
        t.escrowBalance = msg.value;
        totalVolumeLocked += msg.value;

        emit EscrowFunded(tenderId, msg.sender, msg.value);
    }

    /**
     * @notice Cancels the tender if the Department fails to fund escrow by escrowDeadline.
     * @dev Refunds the winner's performance bond automatically via pull balance.
     * @param tenderId ID of the tender.
     */
    function cancelUnfundedTender(uint256 tenderId) external nonReentrant whenNotPaused {
        Tender storage t = _getTender(tenderId);
        if (t.status != TenderStatus.Awarded) {
            revert InvalidTenderStatus(t.status, TenderStatus.Awarded);
        }
        if (block.timestamp <= t.escrowDeadline) {
            revert EscrowWindowNotExpired(uint64(block.timestamp), t.escrowDeadline);
        }

        t.status = TenderStatus.Cancelled;

        // Winner's bond is unlocked via claimBondRefund or direct credit
        CommitInfo storage winnerCommit = _commits[tenderId][t.winningBidder];
        if (!winnerCommit.bondClaimed && t.bidBond > 0) {
            winnerCommit.bondClaimed = true;
            t.performanceBondReleased = true;
            _creditBalance(t.winningBidder, t.bidBond, "Escrow timeout winner bond refund");
        }

        emit TenderCancelled(tenderId, "Department failed to fund escrow in time");
    }

    /**
     * @notice Department cancels a tender before the commit deadline. All committed bonds become refundable.
     * @param tenderId ID of the tender.
     * @param reason Public reason for cancellation.
     */
    function cancelTender(uint256 tenderId, string calldata reason) external nonReentrant whenNotPaused {
        Tender storage t = _getTender(tenderId);
        if (msg.sender != t.department) {
            revert NotTenderDepartment(msg.sender, t.department);
        }
        if (t.status != TenderStatus.Open) {
            revert InvalidTenderStatus(t.status, TenderStatus.Open);
        }
        if (block.timestamp > t.commitDeadline) {
            revert CancelWindowClosed(uint64(block.timestamp), t.commitDeadline);
        }

        t.status = TenderStatus.Cancelled;
        emit TenderCancelled(tenderId, reason);
    }

    // =============================================================
    //                 5. MILESTONES, PENALTIES & DEFAULT
    // =============================================================

    /**
     * @notice Winning contractor submits completion evidence for the current sequential milestone.
     * @param tenderId ID of the tender.
     * @param milestoneIndex 0-based index of the milestone.
     * @param evidenceHash IPFS/SHA256 hash of completion proof.
     */
    function submitMilestone(
        uint256 tenderId,
        uint256 milestoneIndex,
        bytes32 evidenceHash
    ) external whenNotPaused {
        Tender storage t = _getTender(tenderId);
        if (t.status != TenderStatus.Funded) {
            revert InvalidTenderStatus(t.status, TenderStatus.Funded);
        }
        if (msg.sender != t.winningBidder) {
            revert NotWinningContractor(msg.sender, t.winningBidder);
        }
        if (evidenceHash == bytes32(0)) revert InvalidEvidenceHash();

        Milestone[] storage milestones = _tenderMilestones[tenderId];
        if (milestoneIndex >= milestones.length) {
            revert InvalidMilestoneIndex(milestoneIndex, milestones.length);
        }
        if (milestoneIndex != t.completedMilestones) {
            revert PreviousMilestoneNotApproved(milestoneIndex);
        }

        Milestone storage m = milestones[milestoneIndex];
        if (m.status != MilestoneStatus.Pending) {
            revert MilestoneAlreadySubmitted(milestoneIndex);
        }

        uint64 nowTime = uint64(block.timestamp);
        m.evidenceHash = evidenceHash;
        m.submittedAt = nowTime;
        m.status = MilestoneStatus.Submitted;

        emit MilestoneSubmitted(tenderId, milestoneIndex, evidenceHash, nowTime);
    }

    /**
     * @notice Authorized verifier approves a submitted milestone.
     * @dev Automatically calculates late penalty and releases funds once approvalThreshold is reached.
     * @param tenderId ID of the tender.
     * @param milestoneIndex 0-based index of the milestone.
     */
    function approveMilestone(
        uint256 tenderId,
        uint256 milestoneIndex
    ) external nonReentrant whenNotPaused {
        Tender storage t = _getTender(tenderId);
        if (t.status != TenderStatus.Funded) {
            revert InvalidTenderStatus(t.status, TenderStatus.Funded);
        }
        if (!_isTenderVerifier[tenderId][msg.sender]) {
            revert NotAuthorizedVerifier(msg.sender);
        }

        Milestone[] storage milestones = _tenderMilestones[tenderId];
        if (milestoneIndex >= milestones.length) {
            revert InvalidMilestoneIndex(milestoneIndex, milestones.length);
        }

        Milestone storage m = milestones[milestoneIndex];
        if (m.status == MilestoneStatus.Pending) {
            revert MilestoneNotSubmitted(milestoneIndex);
        }
        if (m.status == MilestoneStatus.Approved) {
            revert MilestoneAlreadyApproved(milestoneIndex);
        }
        if (_milestoneApprovals[tenderId][milestoneIndex][msg.sender]) {
            revert AlreadyApprovedMilestone(msg.sender, milestoneIndex);
        }

        _milestoneApprovals[tenderId][milestoneIndex][msg.sender] = true;
        uint16 newCount = ++m.approvalCount;

        emit MilestoneApproved(tenderId, milestoneIndex, msg.sender, newCount);

        if (newCount >= t.approvalThreshold) {
            _releaseMilestonePayout(t, milestones, milestoneIndex);
        }
    }

    /**
     * @dev Internal helper to compute milestone gross amount, late delivery penalty, and release funds.
     */
    function _releaseMilestonePayout(
        Tender storage t,
        Milestone[] storage milestones,
        uint256 milestoneIndex
    ) internal {
        Milestone storage m = milestones[milestoneIndex];
        m.status = MilestoneStatus.Approved;

        uint256 grossAmount;
        bool isFinalMilestone = (milestoneIndex == milestones.length - 1);

        // Remainder goes to the final milestone to prevent rounding dust
        if (isFinalMilestone) {
            grossAmount = t.winningAmount - t.totalMilestoneAllocated;
        } else {
            grossAmount = (t.winningAmount * m.percentageBps) / BPS_DENOMINATOR;
        }

        t.totalMilestoneAllocated += grossAmount;
        t.escrowBalance -= grossAmount;

        // Calculate late penalty based on full days late (submittedAt > dueDate)
        uint256 penalty = 0;
        if (m.submittedAt > m.dueDate && t.latePenaltyRateBps > 0) {
            uint256 elapsedSeconds = m.submittedAt - m.dueDate;
            uint256 daysLate = (elapsedSeconds + 1 days - 1) / 1 days;
            penalty = (grossAmount * t.latePenaltyRateBps * daysLate) / BPS_DENOMINATOR;
            if (penalty > grossAmount) {
                penalty = grossAmount;
            }
        }

        uint256 netPayout = grossAmount - penalty;
        m.payoutAmount = netPayout;
        m.penaltyDeducted = penalty;

        unchecked {
            ++t.completedMilestones;
        }

        uint256 bondReturned = 0;
        if (isFinalMilestone) {
            t.status = TenderStatus.Completed;
            t.performanceBondReleased = true;
            bondReturned = t.bidBond;
            _commits[t.id][t.winningBidder].bondClaimed = true;
            unchecked {
                ++totalCompletedTenders;
            }
        }

        // Payout penalty to Department and netPayout + bondReturned to Contractor
        if (penalty > 0) {
            _safeTransferOrCredit(t.department, penalty, "Late delivery penalty refund");
        }

        uint256 totalToContractor = netPayout + bondReturned;
        if (totalToContractor > 0) {
            _safeTransferOrCredit(t.winningBidder, totalToContractor, "Milestone payout");
        }

        emit MilestoneReleased(
            t.id,
            milestoneIndex,
            t.winningBidder,
            netPayout,
            penalty,
            bondReturned
        );

        if (isFinalMilestone) {
            emit TenderCompleted(t.id, t.winningBidder);
        }
    }

    /**
     * @notice Declares contractor default if the current Pending milestone passes dueDate + gracePeriod.
     * @dev Anyone can call. Only allowed if the current milestone status is Pending.
     *      Forfeits performance bond, returns remaining escrow to Department, debars contractor.
     * @param tenderId ID of the tender.
     */
    function declareDefault(uint256 tenderId) external nonReentrant whenNotPaused {
        Tender storage t = _getTender(tenderId);
        if (t.status != TenderStatus.Funded) {
            revert InvalidTenderStatus(t.status, TenderStatus.Funded);
        }

        Milestone[] storage milestones = _tenderMilestones[tenderId];
        uint256 currentIdx = t.completedMilestones;
        Milestone storage m = milestones[currentIdx];

        if (m.status != MilestoneStatus.Pending) {
            revert MilestoneNotPending(currentIdx, m.status);
        }

        uint64 defaultEligibleTime = m.dueDate + t.gracePeriod;
        if (block.timestamp <= defaultEligibleTime) {
            revert GracePeriodNotExpired(uint64(block.timestamp), defaultEligibleTime);
        }

        t.status = TenderStatus.Defaulted;
        t.performanceBondReleased = true;
        _commits[tenderId][t.winningBidder].bondClaimed = true;

        uint256 remainingEscrow = t.escrowBalance;
        t.escrowBalance = 0;
        uint256 forfeitedPerformanceBond = t.bidBond;

        unchecked {
            ++totalDefaultedTenders;
        }

        // Debar the defaulting contractor automatically
        BidderInfo storage contractorInfo = _bidders[t.winningBidder];
        if (!contractorInfo.debarred) {
            contractorInfo.debarred = true;
            unchecked {
                ++totalDebarredBidders;
            }
            emit BidderDebarred(t.winningBidder, "Defaulted on tender milestone");
        }

        uint256 totalDepartmentRecovery = remainingEscrow + forfeitedPerformanceBond;
        if (totalDepartmentRecovery > 0) {
            _creditBalance(t.department, totalDepartmentRecovery, "Default recovery & bond forfeiture");
        }

        emit TenderDefaulted(
            tenderId,
            t.winningBidder,
            remainingEscrow,
            forfeitedPerformanceBond
        );
    }

    // =============================================================
    //                     6. PULL PAYMENTS & REFUNDS
    // =============================================================

    /**
     * @notice Pull-payment function for losing bidders (or all bidders on a cancelled tender) to claim their bid bond.
     * @param tenderId ID of the tender.
     */
    function claimBondRefund(uint256 tenderId) external nonReentrant whenNotPaused {
        Tender storage t = _getTender(tenderId);
        CommitInfo storage c = _commits[tenderId][msg.sender];

        if (!c.committed) revert NoCommitFound(msg.sender);
        if (c.bondClaimed) revert BondAlreadyClaimed();

        bool eligible = false;

        if (t.status == TenderStatus.Cancelled) {
            if (t.winningBidder == address(0) || (c.revealed && c.valid && msg.sender != t.winningBidder)) {
                eligible = true;
            }
        } else if (
            t.status == TenderStatus.Awarded ||
            t.status == TenderStatus.Funded ||
            t.status == TenderStatus.Completed ||
            t.status == TenderStatus.Defaulted
        ) {
            if (c.revealed && c.valid && msg.sender != t.winningBidder) {
                eligible = true;
            }
        }

        if (!eligible) revert BondNotRefundable();

        c.bondClaimed = true;
        uint256 bondAmount = t.bidBond;
        totalVolumeLocked -= bondAmount;

        (bool success, ) = payable(msg.sender).call{value: bondAmount}("");
        if (!success) revert NativeTransferFailed();

        emit BondRefundClaimed(tenderId, msg.sender, bondAmount);
    }

    /**
     * @notice Withdraws accumulated balance from the pull-payment ledger.
     */
    function withdrawPullBalance() external nonReentrant {
        uint256 amount = claimableBalance[msg.sender];
        if (amount == 0) revert NothingToWithdraw();

        claimableBalance[msg.sender] = 0;
        if (totalVolumeLocked >= amount) {
            totalVolumeLocked -= amount;
        }

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        if (!success) revert NativeTransferFailed();

        emit BalanceWithdrawn(msg.sender, amount);
    }

    /**
     * @dev Credits an account's pull-payment balance.
     */
    function _creditBalance(address account, uint256 amount, string memory reason) internal {
        claimableBalance[account] += amount;
        emit BalanceCredited(account, amount, reason);
    }

    /**
     * @dev Attempts direct transfer; if recipient is a contract that reverts, credits pull balance instead
     *      so malicious contracts can never DoS milestone progression.
     */
    function _safeTransferOrCredit(address recipient, uint256 amount, string memory reason) internal {
        if (totalVolumeLocked >= amount) {
            totalVolumeLocked -= amount;
        }
        (bool success, ) = payable(recipient).call{value: amount}("");
        if (!success) {
            totalVolumeLocked += amount;
            _creditBalance(recipient, amount, reason);
        }
    }

    // =============================================================
    //                            7. VIEWS
    // =============================================================

    /**
     * @notice Helper to compute the exact commitment hash required during commitBid.
     */
    function computeCommitHash(
        uint256 amount,
        bytes32 salt,
        address bidder,
        uint256 tenderId,
        uint256 chainId
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(amount, salt, bidder, tenderId, chainId));
    }

    /**
     * @notice Returns full tender metadata and state.
     */
    function getTenderDetails(uint256 tenderId) external view returns (Tender memory) {
        return _getTender(tenderId);
    }

    /**
     * @notice Returns tender timeline deadlines and current phase name.
     */
    function getTenderTimeline(
        uint256 tenderId
    )
        external
        view
        returns (
            uint64 commitDeadline,
            uint64 revealDeadline,
            uint64 escrowDeadline,
            uint64 gracePeriod,
            string memory currentPhase
        )
    {
        Tender storage t = _getTender(tenderId);
        commitDeadline = t.commitDeadline;
        revealDeadline = t.revealDeadline;
        escrowDeadline = t.escrowDeadline;
        gracePeriod = t.gracePeriod;

        if (t.status == TenderStatus.Open) {
            if (block.timestamp <= t.commitDeadline) {
                currentPhase = "Commit Phase";
            } else if (block.timestamp <= t.revealDeadline) {
                currentPhase = "Reveal Phase";
            } else {
                currentPhase = "Awaiting Award Finalization";
            }
        } else if (t.status == TenderStatus.Awarded) {
            currentPhase = "Awarded - Awaiting Escrow";
        } else if (t.status == TenderStatus.Funded) {
            currentPhase = "Execution & Milestones";
        } else if (t.status == TenderStatus.Completed) {
            currentPhase = "Completed";
        } else if (t.status == TenderStatus.Failed) {
            currentPhase = "Failed";
        } else if (t.status == TenderStatus.Cancelled) {
            currentPhase = "Cancelled";
        } else {
            currentPhase = "Defaulted";
        }
    }

    /**
     * @notice Returns commit hash and commit time for a bidder. Does NOT expose bid amount before reveal phase ends.
     */
    function getCommitment(
        uint256 tenderId,
        address bidder
    ) external view returns (bytes32 commitHash, uint64 commitTime, bool committed, bool revealed, bool bondClaimed) {
        CommitInfo storage c = _commits[tenderId][bidder];
        return (c.commitHash, c.commitTime, c.committed, c.revealed, c.bondClaimed);
    }

    /**
     * @notice Returns all revealed bids ONLY after the reveal deadline has passed.
     */
    function getRevealedBids(
        uint256 tenderId
    ) external view returns (RevealedBidView[] memory) {
        Tender storage t = _getTender(tenderId);
        if (block.timestamp <= t.revealDeadline) {
            revert BidsNotYetPublic(uint64(block.timestamp), t.revealDeadline);
        }
        return _revealedBidsList[tenderId];
    }

    /**
     * @notice Returns all milestones for a tender.
     */
    function getMilestones(uint256 tenderId) external view returns (Milestone[] memory) {
        _getTender(tenderId);
        return _tenderMilestones[tenderId];
    }

    /**
     * @notice Returns verifier list for a tender and whether a specific verifier approved a milestone.
     */
    function getTenderVerifiers(uint256 tenderId) external view returns (address[] memory) {
        _getTender(tenderId);
        return _tenderVerifiers[tenderId];
    }

    /**
     * @notice Checks if a verifier has approved a specific milestone.
     */
    function hasVerifierApproved(
        uint256 tenderId,
        uint256 milestoneIndex,
        address verifier
    ) external view returns (bool) {
        return _milestoneApprovals[tenderId][milestoneIndex][verifier];
    }

    /**
     * @notice Returns registration, debarment, identity hash, and group ID for a bidder.
     */
    function getBidderStatus(address bidder) external view returns (BidderInfo memory) {
        return _bidders[bidder];
    }

    /**
     * @notice Returns aggregate platform statistics.
     */
    function getPlatformStats()
        external
        view
        returns (
            uint256 tendersCount,
            uint256 registeredBidders,
            uint256 debarredBidders,
            uint256 awardedTenders,
            uint256 completedTenders,
            uint256 defaultedTenders,
            uint256 tvl
        )
    {
        return (
            tenderCount,
            totalRegisteredBidders,
            totalDebarredBidders,
            totalAwardedTenders,
            totalCompletedTenders,
            totalDefaultedTenders,
            totalVolumeLocked
        );
    }

    /**
     * @dev Internal lookup helper that reverts if tender does not exist.
     */
    function _getTender(uint256 tenderId) internal view returns (Tender storage t) {
        t = _tenders[tenderId];
        if (t.status == TenderStatus.None) revert TenderNotFound(tenderId);
    }
}
