const assert = require("node:assert/strict"),
  R = require("../rules.js");
const t = R.date(2026, 9, 16) + 13 * 3600000,
  k = { period: "day", schedule: "weekdays", deadline: "end" };
assert.equal(R.status(k, R.date(2026, 9, 15), 0, 1, t), "missed");
assert.equal(R.status(k, R.date(2026, 9, 16), 0, 1, t), "pending");
assert.equal(R.status(k, R.date(2026, 9, 17), 0, 1, t), "future");
assert.equal(R.status(k, R.date(2026, 9, 11), 0, 1, t), "optional");
assert.equal(
  R.status({ ...k, schedule: "every" }, R.date(2026, 9, 11), 0, 1, t),
  "missed",
);
assert.equal(
  R.status(
    { ...k, deadline: "next" },
    R.date(2026, 9, 15),
    0,
    1,
    R.date(2026, 9, 16) + 7 * 3600000,
  ),
  "pending",
);
assert.equal(
  R.status(
    { ...k, deadline: "next" },
    R.date(2026, 9, 15),
    0,
    1,
    R.date(2026, 9, 16) + 8 * 3600000,
  ),
  "missed",
);
assert.equal(R.status(k, R.date(2026, 9, 16), 1, 2, t), "partial");
assert.equal(R.status(k, R.date(2026, 9, 15), 1, 2, t), "missed");
assert.equal(R.status(k, R.date(2026, 9, 16), 2, 2, t), "done");
for (const [period, past, current, future] of [
  ["week", R.date(2026, 9, 4), R.date(2026, 9, 11), R.date(2026, 9, 18)],
  ["month", R.date(2026, 8, 1), R.date(2026, 9, 1), R.date(2026, 10, 1)],
  ["quarter", R.date(2026, 6, 1), R.date(2026, 9, 1), R.date(2027, 0, 1)],
]) {
  assert.equal(R.status({ ...k, period }, past, 0, 1, t), "missed");
  assert.equal(R.status({ ...k, period }, current, 0, 1, t), "pending");
  assert.equal(R.status({ ...k, period }, future, 0, 1, t), "future");
}
let n = 0;
for (const expected of [1, 2, 0]) {
  n = R.nextEntry(k, R.date(2026, 9, 15), n, 2);
  assert.equal(n, expected);
}
assert.equal(R.sundays(2026, 10).length, 5);
assert.equal(R.key(R.date(2026, 9, 16), 0), "2026-10-16/0");
const sunday = R.date(2026, 9, 11);
let weekendCount = 0;
for (const expected of [-1, 1, 0]) {
  weekendCount = R.nextEntry(k, sunday, weekendCount, 1);
  assert.equal(weekendCount, expected);
}
assert.equal(R.status(k, sunday, -1, 1, t), "missed");
assert.equal(R.status(k, sunday, 1, 1, t), "done");
assert.equal(R.status(k, sunday, 0, 1, t), "optional");
assert.equal(R.status(k, R.date(2026, 9, 17), -1, 1, t), "future");
assert.equal(R.nextEntry(k, R.date(2026, 9, 15), 0, 1), 1);
assert.equal(R.nextEntry({ ...k, schedule: "every" }, sunday, 0, 1), 1);
let multi = 0;
for (const expected of [-1, 1, 2, 0]) {
  multi = R.nextEntry(k, sunday, multi, 2);
  assert.equal(multi, expected);
}
console.log("RULES VERIFIED");
