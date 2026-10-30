const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function decodeContractError(openTender, error) {
  try {
    const dataCandidates = [
      error?.data,
      error?.info?.error?.data,
      error?.error?.data,
      error?.receipt?.data,
      error?.payload?.params?.[0]?.data,
      error?.data?.data,
    ];
    for (const d of dataCandidates) {
      if (typeof d === "string" && d.startsWith("0x") && d.length >= 10) {
        try {
          const parsed = openTender.interface.parseError(d);
          if (parsed) {
            const args = parsed.args
              .map((a) => (typeof a === "bigint" ? a.toString() : JSON.stringify(a)))
              .join(", ");
            return `${parsed.name}(${args})`;
          }
        } catch (_) {}
      }
    }
  } catch (_) {}

  if (error?.reason) return error.reason;
  if (error?.shortMessage) return error.shortMessage;
  return error?.message || String(error);
}

async function waitUntilTimestamp(targetUnixSeconds, label) {
  while (true) {
    const latestBlock = await hre.ethers.provider.getBlock("latest");
    const now = Number(latestBlock.timestamp);
    const remaining = targetUnixSeconds - now;
    if (remaining <= 0) {
      console.log(`[CLOCK] ${label} reached (block.timestamp = ${now} >= target = ${targetUnixSeconds}).`);
      break;
    }
    console.log(`[WAIT] ${label}: ${remaining}s remaining (current block timestamp: ${now})... sleeping 10s`);
    await sleep(10_000);
  }
}

async function sendStepTx(openTender, stepDesc, txPromise) {
  try {
    const tx = await txPromise;
    const receipt = await tx.wait();
    console.log(`${stepDesc} | tx: ${tx.hash} | link: https://testnet.mstscan.com/tx/${tx.hash}`);
    return { tx, receipt };
  } catch (err) {
    const decoded = decodeContractError(openTender, err);
    console.error(`\n[FAILED] ${stepDesc}: ${decoded}`);
    process.exit(1);
  }
}

async function main() {
  console.log("====================================================================");
  console.log("      OPENTENDER END-TO-END LIVE RUN ON MST TESTNET");
  console.log("====================================================================\n");

  // Load contract deployment
  const deploymentPath = path.join(__dirname, "..", "deployments", "mstTestnet.json");
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Deployment file not found at ${deploymentPath}`);
  }
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const contractAddress = deployment.contractAddress;
  const openTender = await hre.ethers.getContractAt("OpenTender", contractAddress);

  // Load demo wallets
  const walletsPath = path.join(__dirname, "..", ".demo-wallets.json");
  if (!fs.existsSync(walletsPath)) {
    throw new Error(`Wallets file not found at ${walletsPath}`);
  }
  const walletsData = JSON.parse(fs.readFileSync(walletsPath, "utf8"));

  const department = new hre.ethers.Wallet(walletsData.department.privateKey, hre.ethers.provider);
  const verifier1 = new hre.ethers.Wallet(walletsData.verifier1.privateKey, hre.ethers.provider);
  const verifier2 = new hre.ethers.Wallet(walletsData.verifier2.privateKey, hre.ethers.provider);
  const bidder1 = new hre.ethers.Wallet(walletsData.bidder1.privateKey, hre.ethers.provider);
  const bidder2 = new hre.ethers.Wallet(walletsData.bidder2.privateKey, hre.ethers.provider);

  const network = await hre.ethers.provider.getNetwork();
  const chainId = network.chainId;

  console.log(`Contract Address: ${contractAddress}`);
  console.log(`Chain ID        : ${chainId}`);
  console.log(`Department      : ${department.address}`);
  console.log(`Verifier 1      : ${verifier1.address}`);
  console.log(`Verifier 2      : ${verifier2.address}`);
  console.log(`Bidder 1        : ${bidder1.address}`);
  console.log(`Bidder 2        : ${bidder2.address}\n`);

  // Record initial balances for Step 7
  const initialBalances = {
    department: await hre.ethers.provider.getBalance(department.address),
    verifier1: await hre.ethers.provider.getBalance(verifier1.address),
    verifier2: await hre.ethers.provider.getBalance(verifier2.address),
    bidder1: await hre.ethers.provider.getBalance(bidder1.address),
    bidder2: await hre.ethers.provider.getBalance(bidder2.address),
  };

  // 1) Department creates a tender
  const latestBlock = await hre.ethers.provider.getBlock("latest");
  const blockNow = Number(latestBlock.timestamp);
  const COMMIT_DURATION = 180; // 3 minutes
  const REVEAL_DURATION = 180; // 3 minutes
  const commitDeadline = blockNow + COMMIT_DURATION;
  const revealDeadline = commitDeadline + REVEAL_DURATION;

  const ceilingPrice = hre.ethers.parseEther("0.02");
  const bidBond = hre.ethers.parseEther("0.002");
  const escrowWindow = 3600; // 1 hour
  const gracePeriod = 3600; // 1 hour
  const latePenaltyRateBps = 200; // 200 bps
  const approvalThreshold = 2;
  const verifiers = [verifier1.address, verifier2.address];

  const milestones = [
    { percentageBps: 3000, dueDate: revealDeadline + 20 * 60 },
    { percentageBps: 3000, dueDate: revealDeadline + 40 * 60 },
    { percentageBps: 4000, dueDate: revealDeadline + 60 * 60 },
  ];

  const docHash = hre.ethers.id(`E2E_ROAD_REPAIR_TENDER_${Date.now()}`);

  const step1Result = await sendStepTx(
    openTender,
    "1) Department created tender",
    openTender
      .connect(department)
      .createTender(
        ceilingPrice,
        bidBond,
        commitDeadline,
        revealDeadline,
        escrowWindow,
        gracePeriod,
        latePenaltyRateBps,
        docHash,
        milestones,
        verifiers,
        approvalThreshold
      )
  );

  let tenderId;
  for (const log of step1Result.receipt.logs) {
    try {
      const parsed = openTender.interface.parseLog(log);
      if (parsed && parsed.name === "TenderCreated") {
        tenderId = parsed.args.tenderId;
        break;
      }
    } catch (_) {}
  }
  if (!tenderId) {
    tenderId = await openTender.tenderCount();
  }
  console.log(`   -> Tender #${tenderId} initialized.`);
  console.log(`   -> Commit Deadline: ${new Date(commitDeadline * 1000).toISOString()}`);
  console.log(`   -> Reveal Deadline: ${new Date(revealDeadline * 1000).toISOString()}\n`);

  // 2) Bidder1 commits 0.018, Bidder2 commits 0.015
  const bid1Amount = hre.ethers.parseEther("0.018");
  const salt1 = hre.ethers.hexlify(hre.ethers.randomBytes(32));
  const hash1 = await openTender.computeCommitHash(bid1Amount, salt1, bidder1.address, tenderId, chainId);

  await sendStepTx(
    openTender,
    "2a) Bidder 1 committed sealed bid (0.018 tMSTC)",
    openTender.connect(bidder1).commitBid(tenderId, hash1, { value: bidBond })
  );

  const bid2Amount = hre.ethers.parseEther("0.015");
  const salt2 = hre.ethers.hexlify(hre.ethers.randomBytes(32));
  const hash2 = await openTender.computeCommitHash(bid2Amount, salt2, bidder2.address, tenderId, chainId);

  await sendStepTx(
    openTender,
    "2b) Bidder 2 committed sealed bid (0.015 tMSTC)",
    openTender.connect(bidder2).commitBid(tenderId, hash2, { value: bidBond })
  );

  // 3) Wait for the commit deadline, then both reveal
  console.log("\nWaiting for commit deadline...");
  await waitUntilTimestamp(commitDeadline + 1, "Commit deadline");

  await sendStepTx(
    openTender,
    "3a) Bidder 1 revealed bid (0.018 tMSTC)",
    openTender.connect(bidder1).revealBid(tenderId, bid1Amount, salt1)
  );

  await sendStepTx(
    openTender,
    "3b) Bidder 2 revealed bid (0.015 tMSTC)",
    openTender.connect(bidder2).revealBid(tenderId, bid2Amount, salt2)
  );

  // 4) Wait for the reveal deadline, department calls finalizeAward and bidder1 claims deposit refund
  console.log("\nWaiting for reveal deadline...");
  await waitUntilTimestamp(revealDeadline + 1, "Reveal deadline");

  await sendStepTx(
    openTender,
    "4a) Department called finalizeAward",
    openTender.connect(department).finalizeAward(tenderId)
  );

  await sendStepTx(
    openTender,
    "4b) Bidder 1 claimed deposit refund (0.002 tMSTC)",
    openTender.connect(bidder1).claimBondRefund(tenderId)
  );

  // 5) Department funds escrow with 0.015
  await sendStepTx(
    openTender,
    "5) Department funded escrow with 0.015 tMSTC",
    openTender.connect(department).fundEscrow(tenderId, { value: bid2Amount })
  );

  // 6) Bidder2 submits stage 1, verifier1 and verifier2 approve, repeat for stages 2 and 3
  for (let stageIndex = 0; stageIndex < 3; stageIndex++) {
    const stageNum = stageIndex + 1;
    const evidenceHash = hre.ethers.id(`E2E_STAGE_${stageNum}_PROOF_EVIDENCE`);

    await sendStepTx(
      openTender,
      `6a.${stageNum}) Bidder 2 submitted stage ${stageNum}`,
      openTender.connect(bidder2).submitMilestone(tenderId, stageIndex, evidenceHash)
    );

    await sendStepTx(
      openTender,
      `6b.${stageNum}) Verifier 1 approved stage ${stageNum}`,
      openTender.connect(verifier1).approveMilestone(tenderId, stageIndex)
    );

    await sendStepTx(
      openTender,
      `6c.${stageNum}) Verifier 2 approved stage ${stageNum}`,
      openTender.connect(verifier2).approveMilestone(tenderId, stageIndex)
    );
  }

  // 7) Print the final tender status and every wallet's balance change
  const finalDetails = await openTender.getTenderDetails(tenderId);
  const statusNames = [
    "None",
    "Open",
    "Awarded",
    "Funded",
    "Completed",
    "Failed",
    "Cancelled",
    "Defaulted",
  ];
  const finalStatusName = statusNames[Number(finalDetails.status)] || String(finalDetails.status);

  console.log("\n====================================================================");
  console.log("                       FINAL RESULTS");
  console.log("====================================================================");
  console.log(`Final Tender Status: ${finalStatusName} (Code: ${finalDetails.status})`);
  console.log(`Completed Milestones: ${finalDetails.completedMilestones} / 3`);
  console.log(`Winning Bidder     : ${finalDetails.winningBidder}`);
  console.log(`Winning Amount     : ${hre.ethers.formatEther(finalDetails.winningAmount)} tMSTC`);
  console.log(`Performance Bond Released: ${finalDetails.performanceBondReleased}`);

  console.log("\nWallet Balance Changes:");
  const trackedWallets = [
    { name: "Department", role: "department", wallet: department },
    { name: "Verifier 1", role: "verifier1", wallet: verifier1 },
    { name: "Verifier 2", role: "verifier2", wallet: verifier2 },
    { name: "Bidder 1  ", role: "bidder1", wallet: bidder1 },
    { name: "Bidder 2  ", role: "bidder2", wallet: bidder2 },
  ];

  for (const item of trackedWallets) {
    const finalBal = await hre.ethers.provider.getBalance(item.wallet.address);
    const initialBal = initialBalances[item.role];
    const diff = finalBal - initialBal;
    const sign = diff >= 0n ? "+" : "-";
    const absDiff = diff >= 0n ? diff : -diff;
    console.log(
      `- ${item.name} (${item.wallet.address}): Initial: ${hre.ethers.formatEther(
        initialBal
      )} tMSTC | Final: ${hre.ethers.formatEther(finalBal)} tMSTC | Change: ${sign}${hre.ethers.formatEther(
        absDiff
      )} tMSTC`
    );
  }
  console.log("====================================================================\n");
}

main().catch((error) => {
  console.error("Execution failed:", error);
  process.exit(1);
});
