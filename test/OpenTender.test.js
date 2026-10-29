const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("OpenTender Smart Contract Suite & Security Audit Tests", function () {
  let openTender;
  let deployer, department, verifier1, verifier2, bidder1, bidder2, bidder3, other;
  let chainId;

  const BID_BOND = ethers.parseEther("5");
  const CEILING_PRICE = ethers.parseEther("100");
  const DOC_HASH = ethers.id("TENDER_SPEC_V1");
  const GROUP_ALPHA = ethers.id("GROUP_ALPHA");
  const GROUP_BETA = ethers.id("GROUP_BETA");
  const GROUP_GAMMA = ethers.id("GROUP_GAMMA");

  async function makeHash(amount, salt, bidderAddress, tenderId) {
    return openTender.computeCommitHash(amount, salt, bidderAddress, tenderId, chainId);
  }

  async function createStandardTender(opts = {}) {
    const now = await time.latest();
    const commitDeadline = opts.commitDeadline || now + 3600;
    const revealDeadline = opts.revealDeadline || commitDeadline + 3600;
    const escrowWindow = opts.escrowWindow || 7200;
    const gracePeriod = opts.gracePeriod || 86400 * 3;
    const latePenaltyRateBps = opts.latePenaltyRateBps !== undefined ? opts.latePenaltyRateBps : 200;
    const approvalThreshold = opts.approvalThreshold || 2;
    const verifiers = opts.verifiers || [verifier1.address, verifier2.address];

    const milestones = opts.milestones || [
      { percentageBps: 5000, dueDate: revealDeadline + 86400 * 5 },
      { percentageBps: 5000, dueDate: revealDeadline + 86400 * 10 },
    ];

    const tx = await openTender
      .connect(department)
      .createTender(
        opts.ceilingPrice || CEILING_PRICE,
        opts.bidBond || BID_BOND,
        commitDeadline,
        revealDeadline,
        escrowWindow,
        gracePeriod,
        latePenaltyRateBps,
        opts.documentHash || DOC_HASH,
        milestones,
        verifiers,
        approvalThreshold
      );
    const receipt = await tx.wait();
    const tenderId = await openTender.tenderCount();

    return {
      tenderId,
      commitDeadline,
      revealDeadline,
      escrowWindow,
      gracePeriod,
      milestones,
      verifiers,
    };
  }

  beforeEach(async function () {
    [deployer, department, verifier1, verifier2, bidder1, bidder2, bidder3, other] =
      await ethers.getSigners();

    const network = await ethers.provider.getNetwork();
    chainId = network.chainId;

    const OpenTender = await ethers.getContractFactory("OpenTender");
    openTender = await OpenTender.deploy(deployer.address);
    await openTender.waitForDeployment();

    // Setup roles
    await openTender.registerDepartment(department.address);
    await openTender.registerVerifier(verifier1.address);
    await openTender.registerVerifier(verifier2.address);

    // Setup bidders
    await openTender.registerBidder(bidder1.address, ethers.id("PAN_BIDDER_1"), GROUP_ALPHA);
    await openTender.registerBidder(bidder2.address, ethers.id("PAN_BIDDER_2"), GROUP_BETA);
    await openTender.registerBidder(bidder3.address, ethers.id("PAN_BIDDER_3"), GROUP_GAMMA);
  });

  it("Peek attack: before reveal, only hashes are readable", async function () {
    const { tenderId, commitDeadline, revealDeadline } = await createStandardTender();
    const bidAmount = ethers.parseEther("70");
    const salt = ethers.id("SALT_1");
    const commitHash = await makeHash(bidAmount, salt, bidder1.address, tenderId);

    await openTender.connect(bidder1).commitBid(tenderId, commitHash, { value: BID_BOND });

    // Inspect commit info
    const commitment = await openTender.getCommitment(tenderId, bidder1.address);
    expect(commitment.commitHash).to.equal(commitHash);
    expect(commitment.committed).to.be.true;
    expect(commitment.revealed).to.be.false;
    expect(commitment.bondClaimed).to.be.false;

    // Revealed bids list must not be public before revealDeadline
    await expect(openTender.getRevealedBids(tenderId)).to.be.revertedWithCustomError(
      openTender,
      "BidsNotYetPublic"
    );

    // Even during reveal window before deadline, list remains non-public
    await time.increaseTo(commitDeadline + 10);
    await openTender.connect(bidder1).revealBid(tenderId, bidAmount, salt);
    await expect(openTender.getRevealedBids(tenderId)).to.be.revertedWithCustomError(
      openTender,
      "BidsNotYetPublic"
    );

    // After reveal deadline passes, getRevealedBids is viewable
    await time.increaseTo(revealDeadline + 10);
    const revealedBids = await openTender.getRevealedBids(tenderId);
    expect(revealedBids.length).to.equal(1);
    expect(revealedBids[0].bidder).to.equal(bidder1.address);
    expect(revealedBids[0].amount).to.equal(bidAmount);
  });

  it("Edit attack: a second commit by the same bidder reverts", async function () {
    const { tenderId } = await createStandardTender();
    const h1 = await makeHash(ethers.parseEther("70"), ethers.id("S1"), bidder1.address, tenderId);
    const h2 = await makeHash(ethers.parseEther("60"), ethers.id("S2"), bidder1.address, tenderId);

    await openTender.connect(bidder1).commitBid(tenderId, h1, { value: BID_BOND });

    await expect(
      openTender.connect(bidder1).commitBid(tenderId, h2, { value: BID_BOND })
    )
      .to.be.revertedWithCustomError(openTender, "AlreadyCommitted")
      .withArgs(bidder1.address);
  });

  it("Copy attack: a bidder reusing another bidder's hash fails at reveal", async function () {
    const { tenderId, commitDeadline } = await createStandardTender();
    const bidAmount = ethers.parseEther("75");
    const salt = ethers.id("COPIED_SALT");
    const h1 = await makeHash(bidAmount, salt, bidder1.address, tenderId);

    // Bidder 1 commits their genuine hash
    await openTender.connect(bidder1).commitBid(tenderId, h1, { value: BID_BOND });

    // Bidder 2 attempts to copy Bidder 1's commitHash directly
    await openTender.connect(bidder2).commitBid(tenderId, h1, { value: BID_BOND });

    await time.increaseTo(commitDeadline + 10);

    // Bidder 1 reveals successfully
    await expect(openTender.connect(bidder1).revealBid(tenderId, bidAmount, salt)).to.emit(
      openTender,
      "BidRevealed"
    );

    // Bidder 2 attempts to reveal with same amount and salt -> expected hash incorporates bidder2 address!
    const expectedHashForBidder2 = await makeHash(bidAmount, salt, bidder2.address, tenderId);
    await expect(openTender.connect(bidder2).revealBid(tenderId, bidAmount, salt))
      .to.be.revertedWithCustomError(openTender, "CommitHashMismatch")
      .withArgs(h1, expectedHashForBidder2);
  });

  it("Wrong salt, wrong amount, early reveal and late reveal", async function () {
    const { tenderId, commitDeadline, revealDeadline } = await createStandardTender();
    const amount = ethers.parseEther("80");
    const salt = ethers.id("SALT_X");
    const h = await makeHash(amount, salt, bidder1.address, tenderId);

    await openTender.connect(bidder1).commitBid(tenderId, h, { value: BID_BOND });

    // Early reveal before commit deadline
    await expect(openTender.connect(bidder1).revealBid(tenderId, amount, salt)).to.be.revertedWithCustomError(
      openTender,
      "RevealPhaseNotActive"
    );

    await time.increaseTo(commitDeadline + 10);

    // Reveal with wrong salt
    await expect(
      openTender.connect(bidder1).revealBid(tenderId, amount, ethers.id("WRONG_SALT"))
    ).to.be.revertedWithCustomError(openTender, "CommitHashMismatch");

    // Reveal with wrong amount
    await expect(
      openTender.connect(bidder1).revealBid(tenderId, ethers.parseEther("81"), salt)
    ).to.be.revertedWithCustomError(openTender, "CommitHashMismatch");

    // Late reveal past reveal deadline
    await time.increaseTo(revealDeadline + 10);
    await expect(openTender.connect(bidder1).revealBid(tenderId, amount, salt)).to.be.revertedWithCustomError(
      openTender,
      "RevealPhaseNotActive"
    );
  });

  it("Non-reveal forfeits the bond", async function () {
    const { tenderId, commitDeadline, revealDeadline } = await createStandardTender();
    const amount1 = ethers.parseEther("70");
    const salt1 = ethers.id("S1");
    const h1 = await makeHash(amount1, salt1, bidder1.address, tenderId);

    const amount2 = ethers.parseEther("60");
    const salt2 = ethers.id("S2");
    const h2 = await makeHash(amount2, salt2, bidder2.address, tenderId);

    await openTender.connect(bidder1).commitBid(tenderId, h1, { value: BID_BOND });
    await openTender.connect(bidder2).commitBid(tenderId, h2, { value: BID_BOND });

    await time.increaseTo(commitDeadline + 10);
    // Only Bidder 1 reveals; Bidder 2 fails to reveal
    await openTender.connect(bidder1).revealBid(tenderId, amount1, salt1);

    await time.increaseTo(revealDeadline + 10);
    // Finalize award: 1 bond forfeited (5 ETH) to Department
    await expect(openTender.finalizeAward(tenderId))
      .to.emit(openTender, "TenderAwarded")
      .withArgs(tenderId, bidder1.address, amount1, BID_BOND);

    expect(await openTender.claimableBalance(department.address)).to.equal(BID_BOND);

    // Bidder 2 cannot claim back bond
    await expect(openTender.connect(bidder2).claimBondRefund(tenderId)).to.be.revertedWithCustomError(
      openTender,
      "BondNotRefundable"
    );
  });

  it("Tie-break by earliest commit", async function () {
    const { tenderId, commitDeadline, revealDeadline } = await createStandardTender();
    const tiedAmount = ethers.parseEther("65");
    const salt1 = ethers.id("S1");
    const salt2 = ethers.id("S2");

    const h1 = await makeHash(tiedAmount, salt1, bidder1.address, tenderId);
    const h2 = await makeHash(tiedAmount, salt2, bidder2.address, tenderId);

    await openTender.connect(bidder1).commitBid(tenderId, h1, { value: BID_BOND });
    await time.increase(60);
    await openTender.connect(bidder2).commitBid(tenderId, h2, { value: BID_BOND });

    await time.increaseTo(commitDeadline + 10);
    await openTender.connect(bidder1).revealBid(tenderId, tiedAmount, salt1);
    await openTender.connect(bidder2).revealBid(tenderId, tiedAmount, salt2);

    await time.increaseTo(revealDeadline + 10);
    await openTender.finalizeAward(tenderId);

    const details = await openTender.getTenderDetails(tenderId);
    // Earliest commit wins
    expect(details.winningBidder).to.equal(bidder1.address);
  });

  it("Same-group bidders blocked, unregistered and debarred bidders blocked", async function () {
    const { tenderId } = await createStandardTender();

    // Register bidder4 under GROUP_ALPHA (same group as bidder1)
    const [, , , , , , , , bidder4] = await ethers.getSigners();
    await openTender.registerBidder(bidder4.address, ethers.id("PAN_BIDDER_4"), GROUP_ALPHA);

    const h1 = await makeHash(ethers.parseEther("70"), ethers.id("S1"), bidder1.address, tenderId);
    await openTender.connect(bidder1).commitBid(tenderId, h1, { value: BID_BOND });

    // Bidder 4 has same GROUP_ALPHA -> must be blocked
    const h4 = await makeHash(ethers.parseEther("68"), ethers.id("S4"), bidder4.address, tenderId);
    await expect(openTender.connect(bidder4).commitBid(tenderId, h4, { value: BID_BOND }))
      .to.be.revertedWithCustomError(openTender, "GroupConflictDetected")
      .withArgs(GROUP_ALPHA, bidder1.address);

    // Unregistered bidder blocked
    await expect(openTender.connect(other).commitBid(tenderId, h1, { value: BID_BOND }))
      .to.be.revertedWithCustomError(openTender, "BidderNotRegistered")
      .withArgs(other.address);

    // Debarred bidder blocked
    await openTender.debarBidder(bidder3.address, "Fraud investigation");
    const h3 = await makeHash(ethers.parseEther("70"), ethers.id("S3"), bidder3.address, tenderId);
    await expect(openTender.connect(bidder3).commitBid(tenderId, h3, { value: BID_BOND }))
      .to.be.revertedWithCustomError(openTender, "BidderIsDebarred")
      .withArgs(bidder3.address);
  });

  it("Award before the reveal deadline reverts, double award reverts", async function () {
    const { tenderId, commitDeadline, revealDeadline } = await createStandardTender();
    const amount = ethers.parseEther("70");
    const salt = ethers.id("S");
    const h = await makeHash(amount, salt, bidder1.address, tenderId);

    await openTender.connect(bidder1).commitBid(tenderId, h, { value: BID_BOND });
    await time.increaseTo(commitDeadline + 10);
    await openTender.connect(bidder1).revealBid(tenderId, amount, salt);

    // Attempt finalize before reveal deadline
    await expect(openTender.finalizeAward(tenderId)).to.be.revertedWithCustomError(
      openTender,
      "RevealPhaseNotEnded"
    );

    await time.increaseTo(revealDeadline + 10);
    await openTender.finalizeAward(tenderId);

    // Calling finalizeAward again reverts with InvalidTenderStatus
    await expect(openTender.finalizeAward(tenderId)).to.be.revertedWithCustomError(
      openTender,
      "InvalidTenderStatus"
    );
  });

  it("Underfunded or late escrow handling", async function () {
    const { tenderId, commitDeadline, revealDeadline } = await createStandardTender();
    const winAmount = ethers.parseEther("80");
    const salt = ethers.id("S");
    const h = await makeHash(winAmount, salt, bidder1.address, tenderId);

    await openTender.connect(bidder1).commitBid(tenderId, h, { value: BID_BOND });
    await time.increaseTo(commitDeadline + 10);
    await openTender.connect(bidder1).revealBid(tenderId, winAmount, salt);
    await time.increaseTo(revealDeadline + 10);
    await openTender.finalizeAward(tenderId);

    // Non-department funding reverts
    await expect(
      openTender.connect(other).fundEscrow(tenderId, { value: winAmount })
    ).to.be.revertedWithCustomError(openTender, "NotTenderDepartment");

    // Underfunded escrow reverts
    await expect(
      openTender.connect(department).fundEscrow(tenderId, { value: ethers.parseEther("79") })
    ).to.be.revertedWithCustomError(openTender, "IncorrectEscrowAmount");

    // Cancel unfunded tender before escrow window passes reverts
    await expect(openTender.cancelUnfundedTender(tenderId)).to.be.revertedWithCustomError(
      openTender,
      "EscrowWindowNotExpired"
    );

    // Advance past escrow deadline
    const details = await openTender.getTenderDetails(tenderId);
    await time.increaseTo(details.escrowDeadline + 10n);

    // Department attempts funding late -> reverts
    await expect(
      openTender.connect(department).fundEscrow(tenderId, { value: winAmount })
    ).to.be.revertedWithCustomError(openTender, "EscrowWindowExpired");

    // Cancel unfunded tender and refund winner's bond to pull balance
    await expect(openTender.cancelUnfundedTender(tenderId))
      .to.emit(openTender, "TenderCancelled")
      .withArgs(tenderId, "Department failed to fund escrow in time");

    expect(await openTender.claimableBalance(bidder1.address)).to.equal(BID_BOND);
  });

  it("Milestone approval below the threshold does not release funds", async function () {
    const { tenderId, commitDeadline, revealDeadline } = await createStandardTender({
      approvalThreshold: 2,
    });
    const winAmount = ethers.parseEther("80");
    const salt = ethers.id("S");
    const h = await makeHash(winAmount, salt, bidder1.address, tenderId);

    await openTender.connect(bidder1).commitBid(tenderId, h, { value: BID_BOND });
    await time.increaseTo(commitDeadline + 10);
    await openTender.connect(bidder1).revealBid(tenderId, winAmount, salt);
    await time.increaseTo(revealDeadline + 10);
    await openTender.finalizeAward(tenderId);
    await openTender.connect(department).fundEscrow(tenderId, { value: winAmount });

    // Submit milestone 0
    await openTender.connect(bidder1).submitMilestone(tenderId, 0, ethers.id("EV_0"));

    // Unauthorized verifier approves -> reverts
    await expect(
      openTender.connect(other).approveMilestone(tenderId, 0)
    ).to.be.revertedWithCustomError(openTender, "NotAuthorizedVerifier");

    // Verifier 1 approves (1 of 2) -> does not release funds
    const balBefore = await ethers.provider.getBalance(bidder1.address);
    await expect(openTender.connect(verifier1).approveMilestone(tenderId, 0))
      .to.emit(openTender, "MilestoneApproved")
      .withArgs(tenderId, 0, verifier1.address, 1);

    const m = (await openTender.getMilestones(tenderId))[0];
    expect(m.status).to.equal(1); // Still Submitted (1), not Approved (2)
    const balAfter = await ethers.provider.getBalance(bidder1.address);
    expect(balAfter).to.equal(balBefore);

    // Duplicate approval by Verifier 1 reverts
    await expect(
      openTender.connect(verifier1).approveMilestone(tenderId, 0)
    ).to.be.revertedWithCustomError(openTender, "AlreadyApprovedMilestone");
  });

  it("Late-penalty math, including rounding, with the remainder going to the final milestone", async function () {
    // 3 milestones: 33.33%, 33.33%, 33.34% with odd winning amount of 77 ETH
    const now = await time.latest();
    const commitDeadline = now + 3600;
    const revealDeadline = commitDeadline + 3600;
    const milestones = [
      { percentageBps: 3333, dueDate: revealDeadline + 86400 * 2 },
      { percentageBps: 3333, dueDate: revealDeadline + 86400 * 4 },
      { percentageBps: 3334, dueDate: revealDeadline + 86400 * 6 },
    ];

    const { tenderId } = await createStandardTender({
      commitDeadline,
      revealDeadline,
      milestones,
      latePenaltyRateBps: 300, // 3% per day
    });

    const winAmount = ethers.parseEther("77");
    const salt = ethers.id("S");
    const h = await makeHash(winAmount, salt, bidder1.address, tenderId);

    await openTender.connect(bidder1).commitBid(tenderId, h, { value: BID_BOND });
    await time.increaseTo(commitDeadline + 10);
    await openTender.connect(bidder1).revealBid(tenderId, winAmount, salt);
    await time.increaseTo(revealDeadline + 10);
    await openTender.finalizeAward(tenderId);
    await openTender.connect(department).fundEscrow(tenderId, { value: winAmount });

    // Milestone 0 submitted 2 days late
    await time.setNextBlockTimestamp(milestones[0].dueDate + 86400 * 2);
    await openTender.connect(bidder1).submitMilestone(tenderId, 0, ethers.id("EV_0"));
    await openTender.connect(verifier1).approveMilestone(tenderId, 0);
    await openTender.connect(verifier2).approveMilestone(tenderId, 0);

    const m0 = (await openTender.getMilestones(tenderId))[0];
    const gross0 = (winAmount * 3333n) / 10000n;
    const expectedPenalty0 = (gross0 * 300n * 2n) / 10000n;
    expect(m0.penaltyDeducted).to.equal(expectedPenalty0);
    expect(m0.payoutAmount).to.equal(gross0 - expectedPenalty0);

    // Milestone 1 submitted on time
    await openTender.connect(bidder1).submitMilestone(tenderId, 1, ethers.id("EV_1"));
    await openTender.connect(verifier1).approveMilestone(tenderId, 1);
    await openTender.connect(verifier2).approveMilestone(tenderId, 1);

    // Milestone 2 (Final): remainder goes here
    await openTender.connect(bidder1).submitMilestone(tenderId, 2, ethers.id("EV_2"));
    await openTender.connect(verifier1).approveMilestone(tenderId, 2);
    await openTender.connect(verifier2).approveMilestone(tenderId, 2);

    const allMilestones = await openTender.getMilestones(tenderId);
    const sumGross = allMilestones.reduce(
      (acc, m) => acc + m.payoutAmount + m.penaltyDeducted,
      0n
    );
    expect(sumGross).to.equal(winAmount); // Exactly 77 ETH allocated with zero rounding dust

    const details = await openTender.getTenderDetails(tenderId);
    expect(details.status).to.equal(4); // Completed
    expect(details.escrowBalance).to.equal(0n);
    expect(details.performanceBondReleased).to.be.true;
  });

  it("Default flow", async function () {
    const { tenderId, commitDeadline, revealDeadline, milestones, gracePeriod } =
      await createStandardTender();
    const winAmount = ethers.parseEther("80");
    const salt = ethers.id("SALT_DEF");
    const h = await makeHash(winAmount, salt, bidder1.address, tenderId);

    await openTender.connect(bidder1).commitBid(tenderId, h, { value: BID_BOND });
    await time.increaseTo(commitDeadline + 10);
    await openTender.connect(bidder1).revealBid(tenderId, winAmount, salt);
    await time.increaseTo(revealDeadline + 10);
    await openTender.finalizeAward(tenderId);
    await openTender.connect(department).fundEscrow(tenderId, { value: winAmount });

    // Contractor fails to submit milestone 0. Time passes dueDate + gracePeriod
    const defaultTime = milestones[0].dueDate + gracePeriod;

    // Early declareDefault reverts
    await expect(openTender.declareDefault(tenderId)).to.be.revertedWithCustomError(
      openTender,
      "GracePeriodNotExpired"
    );

    await time.increaseTo(defaultTime + 10);

    // declareDefault forfeits bond, debars contractor, refunds escrow to Department
    await expect(openTender.declareDefault(tenderId))
      .to.emit(openTender, "TenderDefaulted")
      .withArgs(tenderId, bidder1.address, winAmount, BID_BOND)
      .and.to.emit(openTender, "BidderDebarred")
      .withArgs(bidder1.address, "Defaulted on tender milestone");

    // Contractor is debarred
    const status = await openTender.getBidderStatus(bidder1.address);
    expect(status.debarred).to.be.true;

    // Department claimableBalance credited with escrow + forfeited performance bond
    expect(await openTender.claimableBalance(department.address)).to.equal(winAmount + BID_BOND);
  });

  it("Submitted-on-time milestone cannot be defaulted", async function () {
    const { tenderId, commitDeadline, revealDeadline, milestones, gracePeriod } =
      await createStandardTender();
    const winAmount = ethers.parseEther("80");
    const salt = ethers.id("SALT");
    const h1 = await makeHash(winAmount, salt, bidder1.address, tenderId);

    await openTender.connect(bidder1).commitBid(tenderId, h1, { value: BID_BOND });
    await time.increaseTo(commitDeadline + 10);
    await openTender.connect(bidder1).revealBid(tenderId, winAmount, salt);
    await time.increaseTo(revealDeadline + 10);
    await openTender.finalizeAward(tenderId);
    await openTender.connect(department).fundEscrow(tenderId, { value: winAmount });

    // Contractor submits Milestone 0 on time (before milestones[0].dueDate)
    await openTender
      .connect(bidder1)
      .submitMilestone(tenderId, 0, ethers.id("ON_TIME_EVIDENCE"));

    // Time advances past milestones[0].dueDate + gracePeriod while verifiers haven't approved yet
    await time.increaseTo(milestones[0].dueDate + gracePeriod + 100);

    // Attempting to declareDefault must revert because status is Submitted (1), not Pending (0)
    await expect(openTender.declareDefault(tenderId))
      .to.be.revertedWithCustomError(openTender, "MilestoneNotPending")
      .withArgs(0n, 1n);
  });

  it("createTender requires bidBond greater than zero", async function () {
    const now = await time.latest();
    const commitDeadline = now + 3600;
    const revealDeadline = commitDeadline + 3600;
    const milestones = [{ percentageBps: 10000, dueDate: revealDeadline + 86400 * 10 }];

    await expect(
      openTender
        .connect(department)
        .createTender(
          CEILING_PRICE,
          0n, // bidBond == 0 must revert
          commitDeadline,
          revealDeadline,
          7200,
          86400 * 3,
          200,
          DOC_HASH,
          milestones,
          [verifier1.address, verifier2.address],
          2
        )
    ).to.be.revertedWithCustomError(openTender, "InvalidBidBond");
  });

  it("Reentrancy attack using a malicious contract", async function () {
    const MaliciousBidder = await ethers.getContractFactory("MaliciousBidder");
    const attacker = await MaliciousBidder.deploy(await openTender.getAddress());
    await attacker.waitForDeployment();
    const attackerAddress = await attacker.getAddress();

    // Register malicious contract as bidder
    await openTender.registerBidder(
      attackerAddress,
      ethers.id("PAN_ATTACKER"),
      ethers.id("GROUP_ATTACKER")
    );

    const { tenderId, commitDeadline, revealDeadline } = await createStandardTender();
    const winAmount = ethers.parseEther("60");
    const loseAmount = ethers.parseEther("80");
    const salt1 = ethers.id("S1");
    const salt2 = ethers.id("S2");

    const hWin = await makeHash(winAmount, salt1, bidder1.address, tenderId);
    const hLose = await makeHash(loseAmount, salt2, attackerAddress, tenderId);

    // Bidder 1 commits lower winning bid, Attacker commits losing bid
    await openTender.connect(bidder1).commitBid(tenderId, hWin, { value: BID_BOND });
    await attacker.commitBid(tenderId, hLose, { value: BID_BOND });

    await time.increaseTo(commitDeadline + 10);
    await openTender.connect(bidder1).revealBid(tenderId, winAmount, salt1);
    await attacker.revealBid(tenderId, loseAmount, salt2);

    await time.increaseTo(revealDeadline + 10);
    await openTender.finalizeAward(tenderId);

    // Configure attacker to reenter claimBondRefund when receiving ETH
    await attacker.setAttackMode(true);
    await attacker.setTenderId(tenderId);

    // Attempt reentrancy through claimBondRefund -> must revert with NativeTransferFailed because reentrancy is blocked
    await expect(attacker.claimBondRefund(tenderId)).to.be.revertedWithCustomError(
      openTender,
      "NativeTransferFailed"
    );
  });

  it("Access control for every restricted function", async function () {
    const { tenderId } = await createStandardTender();

    // Non-registrar calling registrar functions
    await expect(
      openTender.connect(other).registerDepartment(other.address)
    ).to.be.revertedWithCustomError(openTender, "AccessControlUnauthorizedAccount");

    await expect(
      openTender.connect(other).registerVerifier(other.address)
    ).to.be.revertedWithCustomError(openTender, "AccessControlUnauthorizedAccount");

    await expect(
      openTender.connect(other).registerBidder(other.address, ethers.id("X"), ethers.id("Y"))
    ).to.be.revertedWithCustomError(openTender, "AccessControlUnauthorizedAccount");

    await expect(
      openTender.connect(other).debarBidder(bidder1.address, "reason")
    ).to.be.revertedWithCustomError(openTender, "AccessControlUnauthorizedAccount");

    await expect(
      openTender.connect(other).reinstateBidder(bidder1.address)
    ).to.be.revertedWithCustomError(openTender, "AccessControlUnauthorizedAccount");

    await expect(openTender.connect(other).pause()).to.be.revertedWithCustomError(
      openTender,
      "AccessControlUnauthorizedAccount"
    );

    // Non-department calling createTender
    await expect(
      openTender.connect(other).createTender(
        CEILING_PRICE,
        BID_BOND,
        (await time.latest()) + 3600,
        (await time.latest()) + 7200,
        3600,
        86400,
        200,
        DOC_HASH,
        [{ percentageBps: 10000, dueDate: (await time.latest()) + 86400 * 5 }],
        [verifier1.address],
        1
      )
    ).to.be.revertedWithCustomError(openTender, "AccessControlUnauthorizedAccount");

    // Non-department calling cancelTender
    await expect(
      openTender.connect(other).cancelTender(tenderId, "Cancel reason")
    ).to.be.revertedWithCustomError(openTender, "NotTenderDepartment");
  });

  it("Cancel before commit deadline refunds all committed bonds, fails after commit deadline", async function () {
    const { tenderId, commitDeadline } = await createStandardTender();
    const h1 = await makeHash(ethers.parseEther("70"), ethers.id("S1"), bidder1.address, tenderId);
    const h2 = await makeHash(ethers.parseEther("80"), ethers.id("S2"), bidder2.address, tenderId);

    await openTender.connect(bidder1).commitBid(tenderId, h1, { value: BID_BOND });
    await openTender.connect(bidder2).commitBid(tenderId, h2, { value: BID_BOND });

    // Cancel before commit deadline
    await expect(openTender.connect(department).cancelTender(tenderId, "Budget cuts"))
      .to.emit(openTender, "TenderCancelled")
      .withArgs(tenderId, "Budget cuts");

    // Both bidders claim bond refund
    const bal1Before = await ethers.provider.getBalance(bidder1.address);
    const tx1 = await openTender.connect(bidder1).claimBondRefund(tenderId);
    const r1 = await tx1.wait();
    const bal1After = await ethers.provider.getBalance(bidder1.address);
    expect(bal1After + r1.gasUsed * r1.gasPrice - bal1Before).to.equal(BID_BOND);

    // Double refund reverts
    await expect(openTender.connect(bidder1).claimBondRefund(tenderId)).to.be.revertedWithCustomError(
      openTender,
      "BondAlreadyClaimed"
    );

    // Test cancellation after commit deadline fails
    const t2 = await createStandardTender();
    await time.increaseTo(t2.commitDeadline + 10);
    await expect(
      openTender.connect(department).cancelTender(t2.tenderId, "Late cancel")
    ).to.be.revertedWithCustomError(openTender, "CancelWindowClosed");
  });

  it("Tender marked Failed when zero valid reveals exist", async function () {
    const { tenderId, commitDeadline, revealDeadline } = await createStandardTender();
    const h1 = await makeHash(ethers.parseEther("70"), ethers.id("S1"), bidder1.address, tenderId);

    await openTender.connect(bidder1).commitBid(tenderId, h1, { value: BID_BOND });

    // Advance past reveal deadline without any reveals
    await time.increaseTo(revealDeadline + 10);

    // Finalize awards marks tender Failed, forfeits bond to department
    await expect(openTender.finalizeAward(tenderId))
      .to.emit(openTender, "TenderFailed")
      .withArgs(tenderId, BID_BOND);

    const details = await openTender.getTenderDetails(tenderId);
    expect(details.status).to.equal(5); // TenderStatus.Failed
  });

  it("Pausable emergency stop, views, and fallback pull-credit when contractor rejects ETH", async function () {
    const { tenderId, commitDeadline, revealDeadline, escrowWindow, gracePeriod } =
      await createStandardTender();

    // Emergency pause by Registrar
    await openTender.pause();
    const h1 = await makeHash(ethers.parseEther("70"), ethers.id("S1"), bidder1.address, tenderId);
    await expect(
      openTender.connect(bidder1).commitBid(tenderId, h1, { value: BID_BOND })
    ).to.be.revertedWithCustomError(openTender, "EnforcedPause");

    await openTender.unpause();

    // Verify timeline view
    const timeline = await openTender.getTenderTimeline(tenderId);
    expect(timeline.commitDeadline).to.equal(commitDeadline);
    expect(timeline.revealDeadline).to.equal(revealDeadline);
    expect(timeline.escrowDeadline).to.equal(commitDeadline + 3600 + escrowWindow);
    expect(timeline.gracePeriod).to.equal(gracePeriod);
    expect(timeline.currentPhase).to.equal("Commit Phase");

    // Test platform stats view
    const stats = await openTender.getPlatformStats();
    expect(stats.tendersCount).to.equal(1n);
    expect(stats.registeredBidders).to.equal(3n);

    // Test fallback pull-credit when contractor contract rejects ETH
    const MaliciousBidder = await ethers.getContractFactory("MaliciousBidder");
    const contractorContract = await MaliciousBidder.deploy(await openTender.getAddress());
    await contractorContract.waitForDeployment();
    const contractorAddress = await contractorContract.getAddress();

    await openTender.registerBidder(
      contractorAddress,
      ethers.id("PAN_REJECTER"),
      ethers.id("GROUP_REJECTER")
    );

    const winAmount = ethers.parseEther("50");
    const salt = ethers.id("SALT_REJ");
    const hWin = await makeHash(winAmount, salt, contractorAddress, tenderId);

    await contractorContract.commitBid(tenderId, hWin, { value: BID_BOND });
    await time.increaseTo(commitDeadline + 10);
    await contractorContract.revealBid(tenderId, winAmount, salt);
    await time.increaseTo(revealDeadline + 10);
    await openTender.finalizeAward(tenderId);
    await openTender.connect(department).fundEscrow(tenderId, { value: winAmount });

    // Contractor sets rejectETH = true
    await contractorContract.setRejectETH(true);
    await contractorContract.submitMilestone(tenderId, 0, ethers.id("EV_0"));

    // Verifiers approve milestone 0 -> contractor rejects ETH transfer -> _safeTransferOrCredit credits claimableBalance
    await openTender.connect(verifier1).approveMilestone(tenderId, 0);
    await expect(openTender.connect(verifier2).approveMilestone(tenderId, 0))
      .to.emit(openTender, "BalanceCredited")
      .withArgs(contractorAddress, ethers.parseEther("25"), "Milestone payout");

    // Contractor has claimable pull balance
    expect(await openTender.claimableBalance(contractorAddress)).to.equal(ethers.parseEther("25"));

    // When rejectETH is disabled, contractor can pull balance
    await contractorContract.setRejectETH(false);
    await expect(contractorContract.withdrawPullBalance())
      .to.emit(openTender, "BalanceWithdrawn")
      .withArgs(contractorAddress, ethers.parseEther("25"));

    expect(await openTender.claimableBalance(contractorAddress)).to.equal(0n);
  });
});
