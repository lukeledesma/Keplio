const assert = require("node:assert/strict");
const { KEY, validate, connect, browserStorage } = require("../storage.js");
const empty = { version: 1, items: [] };
const data = {
  version: 1,
  items: [
    {
      id: "test",
      name: "Test",
      period: "day",
      layout: "calendar",
      target: 2,
      schedule: "weekdays",
      deadline: "end",
      description: "",
      marks: { "2026-10-11/0": -1 },
    },
  ],
};

(async () => {
  let raw = null,
    full = false;
  const memory = {
    getItem(key) {
      assert.equal(key, KEY);
      return raw;
    },
    setItem(key, value) {
      assert.equal(key, KEY);
      if (full) throw Error("QuotaExceededError");
      raw = value;
    },
  };
  const a = connect(browserStorage(() => memory));
  const b = connect(browserStorage(() => memory));
  assert.deepEqual(await a.load(), empty);
  assert.deepEqual(await b.load(), empty);
  await a.save(data);
  assert.deepEqual(JSON.parse(raw), data);
  await assert.rejects(b.save(empty), /Another window/);
  assert.deepEqual(await b.load(), data);
  const before = raw;
  full = true;
  await assert.rejects(b.save(empty), /full or unavailable/);
  assert.equal(raw, before);
  full = false;
  await b.save(empty);
  assert.deepEqual(await a.load(), empty);
  raw = "broken";
  await assert.rejects(a.load(), /invalid/);
  assert.equal(raw, "broken");
  raw = JSON.stringify({ version: 1, items: [null] });
  await assert.rejects(a.load(), /invalid/);
  const blocked = connect(
    browserStorage(() => {
      throw Error("SecurityError");
    }),
  );
  await assert.rejects(blocked.load(), /unavailable/);
  const fresh = connect(browserStorage(() => memory));
  await assert.rejects(fresh.save(empty), /Reload/);

  // Lock-aware clients must reject a stale simultaneous save rather than lose data.
  raw = null;
  let queue = Promise.resolve();
  const locks = {
    request(key, fn) {
      assert.equal(key, KEY);
      const next = queue.then(fn);
      queue = next.catch(() => {});
      return next;
    },
  };
  const locked = [0, 1].map(() => connect(browserStorage(() => memory, locks)));
  await Promise.all(locked.map((s) => s.load()));
  const results = await Promise.allSettled([
    locked[0].save(data),
    locked[1].save(empty),
  ]);
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].status, "rejected");
  assert.deepEqual(JSON.parse(raw), data);

  for (const invalid of [
    null,
    [],
    { version: 2, items: [] },
    { version: 1, items: [null] },
  ])
    assert.throws(() => validate(invalid));
  for (const patch of [
    { target: 0 },
    { target: 1.5 },
    { name: " " },
    { period: "year" },
    { period: "week", layout: "calendar" },
    { marks: [] },
    { marks: { "2026-02-30/0": 1 } },
    { marks: { "2026-10-01/30": 1 } },
    { marks: { "2026-10-01/0": "1" } },
    { description: "x".repeat(4001) },
  ])
    assert.throws(() =>
      validate({ version: 1, items: [{ ...data.items[0], ...patch }] }),
    );
  assert.throws(() =>
    validate({ version: 1, items: [data.items[0], data.items[0]] }),
  );
  assert.deepEqual(validate(data), data);

  let stored = structuredClone(data);
  const custom = connect({
    async load() {
      return stored;
    },
    async save(value) {
      stored = value;
    },
  });
  const loaded = await custom.load();
  loaded.items[0].name = "Changed";
  assert.equal(stored.items[0].name, "Test");
  await custom.save(loaded);
  loaded.items[0].name = "Not saved";
  assert.equal(stored.items[0].name, "Changed");
  await assert.rejects(
    connect({
      load() {
        return null;
      },
    }).load(),
    /Invalid/,
  );
  await assert.rejects(
    connect({
      save() {
        throw Error("Host rejected save");
      },
    }).save(empty),
    /Host rejected/,
  );
  console.log("STORAGE VERIFIED");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
