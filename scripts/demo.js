const hre = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

async function main() {
  console.log("====================================================================");
  console.log("       OPENTENDER LOCAL DEMO (FULL LIFECYCLE SIMULATION)            ");
  console.log("====================================================================\n");

  const signers = await hre.ethers.getSigners();
  const [deployer, department, verifier1, verifier2, bidder1, bidder2] = signers;
  const chainId = (await hre.ethers.provider.getNetwork()).chainId;

  console.log(`Deployer / Registrar: ${deployer.address}`);
  console.log(`Department          : ${department.address}`);
  console.log(`Verifier 1          : ${verifier1.address}`);
  console.log(`Verifier 2          : ${verifier2.address}`);
  console.log(`Bidder 1            : ${bidder1.address}`);
  console.log(`Bidder 2            : ${bidder2.address}\n`);

  // 1. Deploy
  const OpenTender = await hre.ethers.getContractFactory("OpenTender", deployer);
  const openTender = await OpenTender.deploy(deployer.address);
  await openTender.waitForDeployment();
  const openTenderAddress = await openTender.getAddress();
  console.log(`OpenTender deployed at: ${openTenderAddress}\n`);

  // 2. Register roles & bidders
  await (await openTender.registerDepartment(department.address)).wait();
  await (await openTender.registerVerifier(verifier1.address)).wait();
  await (await openTender.registerVerifier(verifier2.address)).wait();
  await (
    await openTender.registerBidder(
      bidder1.address,
      hre.ethers.id("DEMO_ID_1"),
      hre.ethers.id("GROUP_A")
    )
  ).wait();
  await (
    await openTender.registerBidder(
      bidder2.address,
      hre.ethers.id("DEMO_ID_2"),
      hre.ethers.id("GROUP_B")
    )
  ).wait();
  console.log("[+] Registered Department, 2 Verifiers, and 2 Bidders.\n");

  // 3. Create Tender
  const now = await time.latest();
  const commitDeadline = now + 1800; // 30m
  const revealDeadline = commitDeadline + 1800; // 30m
  const ceilingPrice = hre.ethers.parseEther("100");
  const bidBond = hre.ethers.parseEther("5");

  const milestones = [
    { percentageBps: 5000, dueDate: revealDeadline + 86400 * 7 },
    { percentageBps: 5000, dueDate: revealDeadline + 86400 * 14 },
  ];

  await (
    await openTender
      .connect(department)
      .createTender(
        ceilingPrice,
        bidBond,
        commitDeadline,
        revealDeadline,
        86400 * 2,
        86400 * 3,
        200,
        hre.ethers.id("DEMO_TENDER_SPEC"),
        milestones,
        [verifier1.address, verifier2.address],
        2
      )
  ).wait();

  const tenderId = await openTender.tenderCount();
  console.log(`[+] Created Tender #${tenderId}`);
  console.log(`    Ceiling: 100 MSTC | Bid Bond: 5 MSTC | Threshold: 2-of-2 verifiers\n`);

  // 4. Commit Phase
  console.log("--- 1. COMMIT PHASE ---");
  const salt1 = hre.ethers.id("DEMO_SALT_1");
  const salt2 = hre.ethers.id("DEMO_SALT_2");
  const bid1 = hre.ethers.parseEther("85");
  const bid2 = hre.ethers.parseEther("78"); // Winner

  const hash1 = await openTender.computeCommitHash(bid1, salt1, bidder1.address, tenderId, chainId);
  const hash2 = await openTender.computeCommitHash(bid2, salt2, bidder2.address, tenderId, chainId);

  await (await openTender.connect(bidder1).commitBid(tenderId, hash1, { value: bidBond })).wait();
  console.log(`    Bidder 1 committed sealed bid + 5 MSTC bond.`);
  await (await openTender.connect(bidder2).commitBid(tenderId, hash2, { value: bidBond })).wait();
  console.log(`    Bidder 2 committed sealed bid + 5 MSTC bond.\n`);

  // Advance to reveal window
  await time.increaseTo(commitDeadline + 10);

  // 5. Reveal Phase
  console.log("--- 2. REVEAL PHASE ---");
  await (await openTender.connect(bidder1).revealBid(tenderId, bid1, salt1)).wait();
  console.log(`    Bidder 1 revealed: 85 MSTC`);
  await (await openTender.connect(bidder2).revealBid(tenderId, bid2, salt2)).wait();
  console.log(`    Bidder 2 revealed: 78 MSTC (Lowest bid!)\n`);

  // Advance past reveal deadline
  await time.increaseTo(revealDeadline + 10);

  // 6. Finalize Award
  console.log("--- 3. FINALIZE AWARD & ESCROW FUNDING ---");
  await (await openTender.finalizeAward(tenderId)).wait();
  const details = await openTender.getTenderDetails(tenderId);
  console.log(`    Winner: ${details.winningBidder} with ${hre.ethers.formatEther(details.winningAmount)} MSTC`);

  // Loser claims bond refund
  await (await openTender.connect(bidder1).claimBondRefund(tenderId)).wait();
  console.log(`    Bidder 1 (Loser) claimed back 5 MSTC bond.`);

  // Department funds escrow
  await (await openTender.connect(department).fundEscrow(tenderId, { value: bid2 })).wait();
  console.log(`    Department funded 78 MSTC into contract escrow.\n`);

  // 7. Milestones
  console.log("--- 4. MILESTONE PROGRESSION & VERIFICATION ---");
  // Milestone 0
  await (await openTender.connect(bidder2).submitMilestone(tenderId, 0, hre.ethers.id("EV_STAGE_0"))).wait();
  console.log(`    Contractor submitted Milestone 0 evidence.`);
  await (await openTender.connect(verifier1).approveMilestone(tenderId, 0)).wait();
  console.log(`    Verifier 1 approved (1/2).`);
  await (await openTender.connect(verifier2).approveMilestone(tenderId, 0)).wait();
  console.log(`    Verifier 2 approved (2/2) -> Milestone 0 (50% = 39 MSTC) released!\n`);

  // Milestone 1 (Final)
  await (await openTender.connect(bidder2).submitMilestone(tenderId, 1, hre.ethers.id("EV_STAGE_1"))).wait();
  console.log(`    Contractor submitted Milestone 1 (Final) evidence.`);
  await (await openTender.connect(verifier1).approveMilestone(tenderId, 1)).wait();
  console.log(`    Verifier 1 approved (1/2).`);
  await (await openTender.connect(verifier2).approveMilestone(tenderId, 1)).wait();
  console.log(`    Verifier 2 approved (2/2) -> Milestone 1 (39 MSTC) + Performance Bond (5 MSTC) returned!`);

  const finalDetails = await openTender.getTenderDetails(tenderId);
  console.log(`\n[SUCCESS] Tender #${tenderId} Status: ${finalDetails.status} (Completed)!`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
