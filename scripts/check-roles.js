const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const deploymentPath = path.join(__dirname, "..", "deployments", "mstTestnet.json");
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const contractAddress = deployment.contractAddress;

  const demoWalletsPath = path.join(__dirname, "..", ".demo-wallets.json");
  const demoWallets = JSON.parse(fs.readFileSync(demoWalletsPath, "utf8"));

  const openTender = await hre.ethers.getContractAt("OpenTender", contractAddress);

  const REGISTRAR_ROLE = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("REGISTRAR_ROLE"));
  const DEPARTMENT_ROLE = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("DEPARTMENT_ROLE"));
  const VERIFIER_ROLE = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("VERIFIER_ROLE"));

  console.log("================================================================================");
  console.log(`CONTRACT: ${contractAddress} on mstTestnet`);
  console.log("================================================================================");

  const rolesTable = [];
  const walletKeys = ["deployer", "department", "verifier1", "verifier2", "bidder1", "bidder2"];

  for (const key of walletKeys) {
    const rawAddr = demoWallets[key].address;
    const addr = hre.ethers.getAddress(rawAddr);

    const [hasReg, hasDept, hasVerif, bidderStatus] = await Promise.all([
      openTender.hasRole(REGISTRAR_ROLE, addr),
      openTender.hasRole(DEPARTMENT_ROLE, addr),
      openTender.hasRole(VERIFIER_ROLE, addr),
      openTender.getBidderStatus(addr),
    ]);

    rolesTable.push({
      RoleKey: key,
      Address: addr,
      REGISTRAR: hasReg,
      DEPARTMENT: hasDept,
      VERIFIER: hasVerif,
      BidderRegistered: bidderStatus.registered,
      BidderDebarred: bidderStatus.debarred,
      GroupId: bidderStatus.groupId,
    });
  }

  console.table(rolesTable);

  console.log("\n================================================================================");
  console.log("SCANNING EVENTS: TenderDefaulted & BidderDebarred");
  console.log("================================================================================");

  const provider = hre.ethers.provider;
  const latestBlock = await provider.getBlockNumber();
  const startBlock = 6681138; // Deployment block of contract on mstTestnet
  const chunkSize = 5000;

  console.log(`Scanning from block ${startBlock} to ${latestBlock} in chunks of ${chunkSize}...`);

  const defaultedFilter = openTender.filters.TenderDefaulted();
  const debarredFilter = openTender.filters.BidderDebarred();

  const allDefaultedEvents = [];
  const allDebarredEvents = [];

  for (let from = startBlock; from <= latestBlock; from += chunkSize) {
    const to = Math.min(from + chunkSize - 1, latestBlock);
    const [defLogs, debLogs] = await Promise.all([
      openTender.queryFilter(defaultedFilter, from, to),
      openTender.queryFilter(debarredFilter, from, to),
    ]);
    allDefaultedEvents.push(...defLogs);
    allDebarredEvents.push(...debLogs);
  }

  console.log(`\nFound ${allDefaultedEvents.length} TenderDefaulted event(s):`);
  for (const ev of allDefaultedEvents) {
    const block = await provider.getBlock(ev.blockNumber);
    const timeStr = block ? new Date(block.timestamp * 1000).toISOString() : "Unknown";
    console.log(
      ` - Tender #${ev.args[0].toString()} | Contractor: ${ev.args[1]} | Block: ${ev.blockNumber} | BlockTime: ${timeStr} (${block ? block.timestamp : 0}) | Tx: ${ev.transactionHash}`
    );
  }

  console.log(`\nFound ${allDebarredEvents.length} BidderDebarred event(s):`);
  for (const ev of allDebarredEvents) {
    const block = await provider.getBlock(ev.blockNumber);
    const timeStr = block ? new Date(block.timestamp * 1000).toISOString() : "Unknown";
    console.log(
      ` - Bidder: ${ev.args[0]} | Reason: "${ev.args[1]}" | Block: ${ev.blockNumber} | BlockTime: ${timeStr} (${block ? block.timestamp : 0}) | Tx: ${ev.transactionHash}`
    );
  }
  console.log("================================================================================\n");
}

main().catch((err) => {
  console.error("Error running check-roles:", err);
  process.exit(1);
});
