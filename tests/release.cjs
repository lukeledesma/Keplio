const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const runtime = [
  "index.html",
  "src/styles.css",
  "src/rules.js",
  "src/storage.js",
  "src/app.js",
];
for (const file of runtime)
  assert.ok(fs.statSync(path.join(root, file)).size > 0, file);
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert.ok(html.includes("<title>Keplio</title>"));
assert.deepEqual(
  [...html.matchAll(/<script defer src="([^"]+)"/g)].map((m) => m[1]),
  ["src/rules.js", "src/storage.js", "src/app.js"],
);
assert.ok(html.includes('href="src/styles.css"'));
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
assert.ok(
  readme.includes("Download ZIP") &&
    fs
      .readFileSync(path.join(root, "docs/development.md"), "utf8")
      .includes("window.KeplioStorage"),
);

for (const file of ["overview.png", "editor.png", "mobile.png"]) {
  const image = fs.readFileSync(path.join(root, "docs/screenshots", file));
  assert.equal(image.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.ok(image.length < 3_000_000);
  if (file !== "mobile.png")
    assert.ok(readme.includes("docs/screenshots/" + file));
}
require("../src/storage.js").validate(require("./fixtures.cjs"));
console.log("RELEASE VERIFIED");
