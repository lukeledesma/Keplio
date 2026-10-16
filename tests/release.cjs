const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const runtime = [
  "index.html",
  "styles.css",
  "rules.js",
  "storage.js",
  "app.js",
];
for (const file of runtime)
  assert.ok(fs.statSync(path.join(root, file)).size > 0, file);
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert.ok(html.includes("<title>Keplio</title>"));
assert.deepEqual(
  [...html.matchAll(/<script defer src="([^"]+)"/g)].map((m) => m[1]),
  ["rules.js", "storage.js", "app.js"],
);
assert.ok(html.includes('href="styles.css"'));
const forbidden = /\/api\/state|server\.py|Open Data Folder|Keplio\.app/;
assert.ok(forbidden.test("/api/state"));
for (const file of runtime)
  assert.ok(
    !forbidden.test(fs.readFileSync(path.join(root, file), "utf8")),
    file,
  );
for (const file of [
  "server.py",
  "macos",
  "dist",
  "Start Keplio.command",
  "package.json",
  "package-lock.json",
])
  assert.ok(!fs.existsSync(path.join(root, file)), file);
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
assert.ok(
  readme.includes("Code → Download ZIP") && readme.includes("window.KeplioStorage"),
);
assert.ok(!readme.includes("Keplio-macOS.zip"));
for (const file of ["overview.jpg", "editor.jpg"]) {
  const image = fs.readFileSync(path.join(root, "docs", file));
  assert.equal(image.readUInt16BE(0), 0xffd8);
  assert.ok(image.length < 3_000_000);
  assert.ok(readme.includes("docs/" + file));
}
console.log("RELEASE VERIFIED");
