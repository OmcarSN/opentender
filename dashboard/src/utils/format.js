import { ethers } from "ethers";

/**
 * Formats a wei amount (BigNumberish or string/number) into an ether string:
 * - Up to 4 decimal places
 * - Strips trailing zeros (e.g. 0.0020 -> 0.002, 1.0000 -> 1)
 * - NEVER displays a non-zero value as 0 (e.g. 0.00004 displays <0.0001 or exact small decimal)
 */
export function fmtAmount(wei) {
  if (wei === undefined || wei === null || wei === "") return "0";
  try {
    const rawEthStr = ethers.formatEther(wei.toString());
    const val = parseFloat(rawEthStr);
    if (val === 0) return "0";

    // Split integer and fractional parts
    const [intPart, fracPart = ""] = rawEthStr.split(".");
    if (!fracPart) return intPart;

    // Take up to 4 decimals
    let trimmed = fracPart.slice(0, 4).replace(/0+$/, "");
    if (trimmed.length > 0) {
      return `${intPart}.${trimmed}`;
    }

    // If trimming reduced fractional part completely but value is non-zero (very small value < 0.0001)
    if (val > 0 && intPart === "0") {
      // Find first non-zero digit so we never show 0 for non-zero
      const nonZeroMatch = fracPart.match(/^0*[1-9]/);
      if (nonZeroMatch) {
        const precision = Math.min(fracPart.length, nonZeroMatch[0].length + 1);
        return `0.${fracPart.slice(0, precision).replace(/0+$/, "")}`;
      }
      return "<0.0001";
    }

    return intPart;
  } catch (err) {
    return String(wei);
  }
}

/**
 * Formats a unix timestamp (in seconds) into date AND time (hours and minutes) in user's locale.
 */
export function fmtDateTime(unixSeconds) {
  if (!unixSeconds || Number(unixSeconds) <= 0) return "—";
  const num = Number(unixSeconds);
  const date = new Date(num * 1000);
  if (isNaN(date.getTime())) return "—";

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
