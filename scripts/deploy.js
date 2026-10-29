const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const network = hre.network.name;
  console.log(`\n=== Deploying OpenTender to network: ${network} ===\n`);

  const signers = await hre.ethers.getSigners();
  if (signers.length === 0) {
    throw new Error("No signer accounts available.");
  }
  const deployer = signers[0];
  console.log(`Deployer / Registrar: ${deployer.address}`);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`Deployer Balance: ${hre.ethers.formatEther(balance)} tMSTC`);

  const OpenTender = await hre.ethers.getContractFactory("OpenTender", deployer);
  const openTender = await OpenTender.deploy(deployer.address);
  await openTender.waitForDeployment();
  const contractAddress = await openTender.getAddress();
  console.log(`OpenTender deployed to: ${contractAddress}`);
  console.log(`Explorer link: https://testnet.mstscan.com/address/${contractAddress}`);

  // Save deployment info
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentData = {
    network,
    chainId: Number((await hre.ethers.provider.getNetwork()).chainId),
    contractAddress,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
  };

  const deploymentFilePath = path.join(deploymentsDir, `${network}.json`);
  fs.writeFileSync(deploymentFilePath, JSON.stringify(deploymentData, null, 2));
  console.log(`Deployment saved to: ${deploymentFilePath}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
