const { ethers } = require("ethers");

const EXPECTED_CHAIN_ID = 91562037n;
const RPC_URL = "https://testnetrpc.mstblockchain.com";

async function main() {
  console.log(`Connecting to RPC: ${RPC_URL}`);
  const provider = new ethers.JsonRpcProvider(RPC_URL);

  const network = await provider.getNetwork();
  const chainId = network.chainId;
  const blockNumber = await provider.getBlockNumber();

  console.log(`Chain ID: ${chainId.toString()}`);
  console.log(`Latest Block Number: ${blockNumber}`);

  if (chainId !== EXPECTED_CHAIN_ID) {
    console.error(
      `ERROR: Chain ID mismatch! Expected ${EXPECTED_CHAIN_ID}, got ${chainId}`
    );
    process.exit(1);
  }

  console.log("Network verification SUCCESS: Connected to MST Testnet (Chain ID 91562037)");
}

main().catch((err) => {
  console.error("Check network failed:", err);
  process.exit(1);
});
