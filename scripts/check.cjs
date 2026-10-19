const { spawnSync } = require("node:child_process");
const path = require("node:path");
const cwd = path.resolve(__dirname, "..");
for (const args of [
  ["--check", "src/app.js"],
  ["--check", "src/rules.js"],
  ["--check", "src/storage.js"],
  ["tests/rules.cjs"],
  ["tests/storage.cjs"],
  ["tests/release.cjs"],
]) {
  const result = spawnSync(process.execPath, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log("ALL CHECKS PASSED");
