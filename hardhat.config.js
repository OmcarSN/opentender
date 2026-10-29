require("@nomicfoundation/hardhat-toolbox");
require("solidity-coverage");
require("dotenv").config();

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY
  ? process.env.DEPLOYER_PRIVATE_KEY.trim()
  : "";

// Fail fast with a clear message if targeting mstTestnet without DEPLOYER_PRIVATE_KEY
const networkArgIndex = process.argv.indexOf("--network");
const targetNetwork =
  networkArgIndex !== -1 && process.argv[networkArgIndex + 1]
    ? process.argv[networkArgIndex + 1]
    : process.env.HARDHAT_NETWORK;

if (targetNetwork === "mstTestnet" && !DEPLOYER_PRIVATE_KEY) {
  throw new Error(
    "Missing DEPLOYER_PRIVATE_KEY in .env: Cannot run on mstTestnet without a valid private key."
  );
}

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
      initialBaseFeePerGas: 0,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    mstTestnet: {
      url: process.env.MST_RPC_URL || "https://testnet-rpc.mstblockchain.com",
      chainId: Number(process.env.MST_CHAIN_ID || 4545),
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
    noColors: true,
  },
};
