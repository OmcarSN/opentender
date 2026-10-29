const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitUntilTimestamp(targetUnixSeconds, label) {
  while (true) {
    const latestBlock = await hre.ethers.provider.getBlock("latest");
    const now = Number(latestBlock.timestamp);
    const remaining = targetUnixSeconds - now;
    if (remaining <= 0) {
      console.log(`[CLOCK] ${label} reached (block.timestamp = ${now}).`);
      break;
    }
    console.log(`[WAIT] ${label}: ${remaining}s remaining... sleeping 15s`);
    await sleep(15_000);
    // On a live network blocks advance naturally; on a local node we send a no-op or mine if needed
  }
}

async function main() {
  console.log("====================================================================");
  console.log("   OPENTENDER LIVE TESTNET DEMO (3m COMMIT / 3m REVEAL, NO TIME TRAVEL)");
  console.log("====================================================================\n");

  const signers = await hre.ethers.getSigners();
  if (signers.length === 0) {
    throw new Error("No signer accounts available. Check DEPLOYER_PRIVATE_KEY in .env.");
  }

  const deployer = signers[0];
  const network = await hre.ethers.provider.getNetwork();
  const chainId = network.chainId;

  // Create ephemeral wallets funded by deployer so a single testnet key can run the full multi-party demo
  const department = hre.ethers.Wallet.createRandom().connect(hre.ethers.provider);
  const verifier1 = hre.ethers.Wallet.createRandom().connect(hre.ethers.provider);
  const verifier2 = hre.ethers.Wallet.createRandom().connect(hre.ethers.provider);
  const bidder1 = hre.ethers.Wallet.createRandom().connect(hre.ethers.provider);
  const bidder2 = hre.ethers.Wallet.createRandom().connect(hre.ethers.provider);

  console.log(`Deployer / Registrar : ${deployer.address}`);
  console.log(`Department Wallet    : ${department.address}`);
  console.log(`Verifier 1 Wallet    : ${verifier1.address}`);
  console.log(`Verifier 2 Wallet    : ${verifier2.address}`);
  console.log(`Bidder 1 Wallet      : ${bidder1.address}`);
  console.log(`Bidder 2 Wallet      : ${bidder2.address}\n`);

  // Fund ephemeral wallets with small testnet amounts
  const fundAmount = hre.ethers.parseEther("0.05");
  for (const [name, wallet] of [
    ["Department", department],
    ["Verifier 1", verifier1],
    ["Verifier 2", verifier2],
    ["Bidder 1", bidder1],
    ["Bidder 2", bidder2],
  ]) {
    const tx = await deployer.sendTransaction({ to: wallet.address, value: fundAmount });
    await tx.wait();
    console.log(`Funded ${name} (${wallet.address}) with 0.05 MSTC`);
  }

  // Load or deploy OpenTender
  const deploymentPath = path.join(__dirname, "..", "deployments", `${hre.network.name}.json`);
  let openTender;
  if (fs.existsSync(deploymentPath)) {
    const { contractAddress } = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    openTender = await hre.ethers.getContractAt("OpenTender", contractAddress, deployer);
    console.log(`\nAttached to existing OpenTender at: ${contractAddress}`);
  } else {
    const OpenTender = await hre.ethers.getContractFactory("OpenTender", deployer);
    openTender = await OpenTender.deploy(deployer.address);
    await openTender.waitForDeployment();
    console.log(`\nDeployed OpenTender at: ${await openTender.getAddress()}`);
  }

  // Register roles and bidders
  await (await openTender.registerDepartment(department.address)).wait();
  await (await openTender.registerVerifier(verifier1.address)).wait();
  await (await openTender.registerVerifier(verifier2.address)).wait();

  const uniqueSuffix = Date.now().toString();
  await (
    await openTender.registerBidder(
      bidder1.address,
      hre.ethers.id(`LIVE_ID_1_${uniqueSuffix}`),
      hre.ethers.id("GROUP_ALPHA")
    )
  ).wait();
  await (
    await openTender.registerBidder(
      bidder2.address,
      hre.ethers.id(`LIVE_ID_2_${uniqueSuffix}`),
      hre.ethers.id("GROUP_BETA")
    )
  ).wait();
  console.log("Registered Department, 2 Verifiers, and 2 Bidders on-chain.\n");

  // Configure real 3-minute commit and 3-minute reveal deadlines
  const latestBlock = await hre.ethers.provider.getBlock("latest");
  const now = Number(latestBlock.timestamp);
  const COMMIT_DURATION = 180; // 3 minutes
  const REVEAL_DURATION = 180; // 3 minutes
  const commitDeadline = now + COMMIT_DURATION;
  const revealDeadline = commitDeadline + REVEAL_DURATION;

  const ceilingPrice = hre.ethers.parseEther("0.02");
  const bidBond = hre.ethers.parseEther("0.002");

  const milestones = [
    { percentageBps: 5000, dueDate: revealDeadline + 3600 },
    { percentageBps: 5000, dueDate: revealDeadline + 7200 },
  ];

  const createTx = await openTender
    .connect(department)
    .createTender(
      ceilingPrice,
      bidBond,
      commitDeadline,
      revealDeadline,
      3600,
      3600,
      200,
      hre.ethers.id("LIVE_MST_TENDER_DOC"),
      milestones,
      [verifier1.address, verifier2.address],
      2
    );
  await createTx.wait();
  const tenderId = await openTender.tenderCount();

  console.log(`Created Live Tender #${tenderId}`);
  console.log(`- Commit Deadline : ${new Date(commitDeadline * 1000).toISOString()} (+3 mins)`);
  console.log(`- Reveal Deadline : ${new Date(revealDeadline * 1000).toISOString()} (+6 mins)\n`);

  // Commit Phase
  const salt1 = hre.ethers.id("LIVE_SALT_1");
  const salt2 = hre.ethers.id("LIVE_SALT_2");
  const bid1Amount = hre.ethers.parseEther("0.018");
  const bid2Amount = hre.ethers.parseEther("0.015"); // Winning lowest bid

  const hash1 = await openTender.computeCommitHash(bid1Amount, salt1, bidder1.address, tenderId, chainId);
  const hash2 = await openTender.computeCommitHash(bid2Amount, salt2, bidder2.address, tenderId, chainId);

  await (await openTender.connect(bidder1).commitBid(tenderId, hash1, { value: bidBond })).wait();
  console.log("Bidder 1 committed sealed bid + 0.002 MSTC bond.");
  await (await openTender.connect(bidder2).commitBid(tenderId, hash2, { value: bidBond })).wait();
  console.log("Bidder 2 committed sealed bid + 0.002 MSTC bond.\n");

  // Wait for Commit Deadline to pass in real time
  await waitUntilTimestamp(commitDeadline + 1, "Commit Deadline");

  // Reveal Phase
  console.log("\n--- REVEALING BIDS ---");
  await (await openTender.connect(bidder1).revealBid(tenderId, bid1Amount, salt1)).wait();
  console.log("Bidder 1 revealed: 0.018 MSTC");
  await (await openTender.connect(bidder2).revealBid(tenderId, bid2Amount, salt2)).wait();
  console.log("Bidder 2 revealed: 0.015 MSTC\n");

  // Wait for Reveal Deadline to pass in real time
  await waitUntilTimestamp(revealDeadline + 1, "Reveal Deadline");

  // Finalize Award & Fund Escrow
  console.log("\n--- FINALIZING AWARD & FUNDING ESCROW ---");
  await (await openTender.connect(deployer).finalizeAward(tenderId)).wait();
  const details = await openTender.getTenderDetails(tenderId);
  console.log(`Winner: ${details.winningBidder} with ${hre.ethers.formatEther(details.winningAmount)} MSTC`);

  await (await openTender.connect(bidder1).claimBondRefund(tenderId)).wait();
  console.log("Loser Bidder 1 claimed back 0.002 MSTC bond.");

  await (await openTender.connect(department).fundEscrow(tenderId, { value: bid2Amount })).wait();
  console.log("Department funded 0.015 MSTC into escrow.\n");

  // Milestones
  console.log("--- EXECUTING & APPROVING MILESTONES ---");
  await (await openTender.connect(bidder2).submitMilestone(tenderId, 0, hre.ethers.id("LIVE_EV_0"))).wait();
  await (await openTender.connect(verifier1).approveMilestone(tenderId, 0)).wait();
  await (await openTender.connect(verifier2).approveMilestone(tenderId, 0)).wait();
  console.log("Milestone 0 (50%) approved and paid.");

  await (await openTender.connect(bidder2).submitMilestone(tenderId, 1, hre.ethers.id("LIVE_EV_1"))).wait();
  await (await openTender.connect(verifier1).approveMilestone(tenderId, 1)).wait();
  await (await openTender.connect(verifier2).approveMilestone(tenderId, 1)).wait();
  console.log("Milestone 1 (50% Final) approved, paid, and performance bond returned!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
