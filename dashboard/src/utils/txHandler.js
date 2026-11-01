import { ethers } from "ethers";
import { CHAIN_ID, CHAIN_NAME } from "../config";
import { parseContractError } from "./errors";

// Concurrency lock preventing double-submissions across the application
let activeTransactionLock = false;

export function isAnyTransactionPending() {
  return activeTransactionLock;
}

/**
 * Executes a contract transaction following the 13-step production lifecycle.
 *
 * @param {Object} options
 * @param {ethers.Contract} options.signerContract The signer-connected contract instance
 * @param {string} options.method The contract method name to invoke
 * @param {Array} [options.args=[]] Method arguments
 * @param {Object} [options.overrides={}] Transaction overrides (value, gasLimit, etc.)
 * @param {number} options.chainId The current wallet chain ID
 * @param {string} options.account The current connected wallet address
 * @param {string} options.title Human-readable operation name (e.g. "Placing sealed bid")
 * @param {Function} options.setNotification Notification dispatcher
 * @param {Function} [options.onRefresh] Callback to refresh application data after confirmation
 * @param {Function} [options.validate] Optional custom validation hook before execution
 * @param {number} [options.confirmationTimeoutMs=75000] Timeout for block confirmation
 * @returns {Promise<{ success: boolean, receipt?: ethers.TransactionReceipt, hash?: string, error?: string }>}
 */
export async function executeTransaction({
  signerContract,
  method,
  args = [],
  overrides = {},
  chainId,
  account,
  title,
  errorTitle,
  setNotification,
  onRefresh,
  validate,
  confirmationTimeoutMs = 75000,
}) {
  // 1. Prevent duplicate simultaneous transactions
  if (activeTransactionLock) {
    const errorMsg = "Another transaction is currently awaiting confirmation. Please wait.";
    if (setNotification) {
      setNotification({ active: false, title: "Transaction In Progress", error: errorMsg });
    }
    return { success: false, error: errorMsg };
  }

  // 2. Validate wallet connection
  if (!account || !signerContract) {
    const errorMsg = "Please connect your wallet before submitting transactions.";
    if (setNotification) {
      setNotification({ active: false, title: "Wallet Disconnected", error: errorMsg });
    }
    return { success: false, error: errorMsg };
  }

  // 3. Validate network
  if (chainId && Number(chainId) !== Number(CHAIN_ID)) {
    const errorMsg = `Wallet is connected to the wrong network. Please switch to ${CHAIN_NAME}.`;
    if (setNotification) {
      setNotification({ active: false, title: "Wrong Network", error: errorMsg });
    }
    return { success: false, error: errorMsg };
  }

  // 4. Validate method exists on contract
  if (typeof signerContract[method] !== "function") {
    const errorMsg = `Contract method "${method}" is not defined.`;
    if (setNotification) {
      setNotification({ active: false, title: "Invalid Operation", error: errorMsg });
    }
    return { success: false, error: errorMsg };
  }

  // 5. Custom pre-execution validation
  if (typeof validate === "function") {
    const validationError = validate();
    if (validationError) {
      if (setNotification) {
        setNotification({ active: false, title: `${title} Validation Failed`, error: validationError });
      }
      return { success: false, error: validationError };
    }
  }

  activeTransactionLock = true;
  let tx = null;

  try {
    // 6. Pre-flight gas estimation / simulation (catches reverts prior to wallet popup)
    const callArgs = Object.keys(overrides).length > 0 ? [...args, overrides] : args;

    try {
      if (signerContract[method].estimateGas) {
        await signerContract[method].estimateGas(...callArgs);
      }
    } catch (estimateErr) {
      const decodedReason = parseContractError(estimateErr, "transaction");
      console.warn(`[OpenTender] Pre-flight estimation failed for ${method}:`, decodedReason);
      // If estimation fails with a known contract custom error, reject early to save user gas
      if (decodedReason && !decodedReason.includes("reverted on-chain") && !decodedReason.includes("simulation failed")) {
        throw estimateErr;
      }
      // If error was just unsupported estimateGas on some networks, continue to wallet prompt
    }

    // 7. Request wallet signature
    if (setNotification) {
      setNotification({
        active: true,
        title: `Awaiting signature in wallet...`,
      });
    }

    tx = await signerContract[method](...callArgs);

    // 8. Transaction submitted: notify with hash
    const txHash = tx.hash;
    console.info(`[OpenTender] Transaction submitted: ${method} (${txHash})`);

    if (setNotification) {
      setNotification({
        active: true,
        hash: txHash,
        title: `Waiting for ${CHAIN_NAME} confirmation...`,
      });
    }

    // 9. Wait for receipt with explicit timeout
    let receipt = null;
    const waitPromise = tx.wait(1);

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Transaction confirmation timed out after ${confirmationTimeoutMs / 1000}s`));
      }, confirmationTimeoutMs);
    });

    try {
      receipt = await Promise.race([waitPromise, timeoutPromise]);
    } catch (waitErr) {
      // If wait timed out, query receipt manually once before declaring failure
      if (waitErr.message.includes("timed out") && signerContract.runner?.provider) {
        try {
          receipt = await signerContract.runner.provider.getTransactionReceipt(txHash);
        } catch {
          // Ignore
        }
      }
      if (!receipt) {
        throw waitErr;
      }
    }

    // 10. Verify receipt status
    if (!receipt || Number(receipt.status) !== 1) {
      throw new Error("Transaction was reverted on-chain by the EVM.");
    }

    console.info(`[OpenTender] Transaction confirmed: ${method} in block ${receipt.blockNumber}`);

    // 11. Refresh on-chain data
    if (typeof onRefresh === "function") {
      try {
        await onRefresh();
      } catch (refreshErr) {
        console.warn("[OpenTender] Post-transaction refresh notice:", refreshErr);
      }
    }

    // 12. Return success receipt
    return {
      success: true,
      receipt,
      hash: txHash,
    };
  } catch (err) {
    console.error(`[OpenTender] Transaction ${method} failed:`, err?.message || err);
    const userMsg = parseContractError(err, "transaction");
    const finalErrorTitle = errorTitle || (title ? `${title} Failed` : "Transaction Failed");

    if (setNotification) {
      setNotification({
        active: false,
        hash: tx?.hash || "",
        title: finalErrorTitle,
        error: userMsg,
      });
    }

    return {
      success: false,
      hash: tx?.hash || "",
      error: userMsg,
    };
  } finally {
    activeTransactionLock = false;
  }
}
