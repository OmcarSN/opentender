const fs = require("fs");
const path = require("path");

function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`Cleaned: ${dir}`);
  }
}

async function main() {
  console.log("=== Resetting OpenTender Local Environment ===\n");

  const projectRoot = path.join(__dirname, "..");
  cleanDir(path.join(projectRoot, "deployments"));
  cleanDir(path.join(projectRoot, "artifacts"));
  cleanDir(path.join(projectRoot, "cache"));
  cleanDir(path.join(projectRoot, "coverage"));

  console.log("\nReset complete. Ready for fresh compilation and deployment.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
