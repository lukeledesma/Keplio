const assert = require("node:assert/strict"),
  R = require("../src/rules.js");
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

// Disabling deadlines changes overdue handling, not stored progress or future locks.
for (const period of ["day", "week", "month", "quarter"]) {
  const relaxed = { ...k, period, deadline: "none" };
  const past = R.date(2025, 0, 1);
  assert.equal(R.status(relaxed, past, 0, 2, t), "pending");
  assert.equal(R.status(relaxed, past, 1, 2, t), "partial");
  assert.equal(R.status(relaxed, past, 2, 2, t), "done");
  assert.equal(R.status(relaxed, past, -1, 2, t), "pending");
  assert.equal(R.status(relaxed, R.date(2027, 0, 1), 0, 2, t), "future");
  assert.equal(
    R.status({ ...relaxed, deadline: "end" }, past, 0, 2, t),
    "missed",
  );
}
assert.equal(
  R.nextEntry({ ...k, deadline: "none" }, R.date(2026, 9, 11), 0, 1),
  1,
);
assert.equal(
  R.nextEntry({ ...k, deadline: "none" }, R.date(2026, 9, 11), -1, 1),
  1,
);
assert.equal(R.nextEntry(k, R.date(2026, 9, 11), 0, 1), -1);

for (const [deadlineTime, minutes] of [
  ["00:00", 0],
  ["06:30", 390],
  ["23:59", 1439],
]) {
  const tracker = { ...k, deadline: "next", deadlineTime };
  const start = R.date(2026, 9, 15);
  const due = start + R.DAY + minutes * 60000;
  assert.equal(R.status(tracker, start, 0, 1, due - 1), "pending");
  assert.equal(R.status(tracker, start, 0, 1, due), "missed");
}

// Legacy slots become one period total without changing the stored entries.
for (const period of ["day", "month", "quarter"]) {
  const legacy = {
    period,
    layout: "rows",
    marks: {
      "2026-10-01/0": 1,
      "2026-10-01/1": 1,
      "2026-10-01/2": 0,
      "2026-09-01/0": 1,
    },
  };
  const before = structuredClone(legacy);
  assert.equal(R.progress(legacy, R.date(2026, 9, 1)), 2);
  assert.deepEqual(legacy, before);
  R.setProgress(legacy, R.date(2026, 9, 1), 3);
  assert.equal(R.progress(legacy, R.date(2026, 9, 1)), 3);
  assert.equal(legacy.marks["2026-09-01/0"], 1);
  assert.equal(legacy.marks["2026-10-01/1"], undefined);
  R.setProgress(legacy, R.date(2026, 9, 1), 0);
  assert.equal(R.progress(legacy, R.date(2026, 9, 1)), 0);
}
assert.equal(
  R.progress(
    { period: "day", layout: "rows", marks: { "2026-10-01/0": -1 } },
    R.date(2026, 9, 1),
  ),
  -1,
);

// Open targets earn credit without a penalty; deadlines expose the shortfall.
assert.deepEqual(R.score([{ state: "partial", count: 1, target: 5 }]), {
  completed: 1,
  required: 1,
  percentage: 100,
});
assert.deepEqual(
  R.score([
    { state: "missed", count: 2, target: 5 },
    { state: "missed", count: 0, target: 5 },
    { state: "done", count: 5, target: 5 },
    { state: "pending", count: 0, target: 5 },
    { state: "optional", count: 0, target: 5 },
    { state: "future", count: 5, target: 5 },
  ]),
  { completed: 7, required: 15, percentage: 46.67 },
);
assert.deepEqual(R.score([{ state: "done", count: 8, target: 5 }]), {
  completed: 5,
  required: 5,
  percentage: 100,
});
assert.deepEqual(R.score([]), { completed: 0, required: 0, percentage: 0 });

for (const deadline of ["end", "none"]) {
  const tracker = { ...k, deadline };
  const start = R.date(2026, 9, 16);
  const scored = (time) =>
    R.score([
      { state: R.status(tracker, start, 1, 3, time), count: 1, target: 3 },
    ]);
  assert.deepEqual(scored(start + R.DAY - 1), {
    completed: 1,
    required: 1,
    percentage: 100,
  });
  assert.deepEqual(
    scored(start + R.DAY),
    deadline === "end"
      ? { completed: 1, required: 3, percentage: 33.33 }
      : { completed: 1, required: 1, percentage: 100 },
  );
}
assert.deepEqual(
  R.score([
    { state: "partial", count: 1, target: 3 },
    { state: "missed", count: 2, target: 5 },
  ]),
  { completed: 3, required: 6, percentage: 50 },
);

assert.ok(Number.isFinite(R.now()));
console.log("RULES VERIFIED");
