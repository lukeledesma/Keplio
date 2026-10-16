(function (global) {
  const KEY = "keplio.v1";
  const isObject = (value) =>
    value !== null && typeof value === "object" && !Array.isArray(value);

  function validate(data) {
    if (
      !isObject(data) ||
      data.version !== 1 ||
      !Array.isArray(data.items) ||
      data.items.length > 200
    )
      throw Error("Invalid tracker data.");
    const ids = new Set();
    for (const k of data.items) {
      if (!isObject(k) || typeof k.id !== "string" || !k.id || ids.has(k.id))
        throw Error("Invalid or duplicate KPI ID.");
      ids.add(k.id);
      if (typeof k.name !== "string" || !k.name.trim() || k.name.length > 100)
        throw Error("A KPI needs a name of 1–100 characters.");
      if (
        !["day", "week", "month", "quarter"].includes(k.period) ||
        !["calendar", "rows"].includes(k.layout) ||
        (k.layout === "calendar" && k.period !== "day")
      )
        throw Error("Invalid KPI period or layout.");
      if (!Number.isInteger(k.target) || k.target < 1 || k.target > 30)
        throw Error("Target must be between 1 and 30.");
      if (
        !["weekdays", "every"].includes(k.schedule) ||
        !["end", "next"].includes(k.deadline)
      )
        throw Error("Invalid schedule or deadline.");
      if (
        typeof k.description !== "string" ||
        k.description.length > 4000 ||
        !isObject(k.marks)
      )
        throw Error("Invalid description or entries.");
      for (const [key, count] of Object.entries(k.marks)) {
        const match = /^(\d{4}-\d{2}-\d{2})\/(\d+)$/.exec(key);
        const date = match && new Date(match[1] + "T00:00:00Z");
        if (
          !match ||
          !Number.isFinite(date.getTime()) ||
          date.toISOString().slice(0, 10) !== match[1] ||
          date.getUTCFullYear() < 1 ||
          Number(match[2]) > 29 ||
          !Number.isInteger(count) ||
          count < (k.period === "day" ? -1 : 0) ||
          count > 30
        )
          throw Error("Invalid completion entry.");
      }
    }
    return data;
  }

  // The UI uses only load() and save(data). Hosts can supply their own adapter.
  function connect(adapter) {
    return {
      async load() {
        return structuredClone(validate(await adapter.load()));
      },
      async save(data) {
        await adapter.save(structuredClone(validate(data)));
      },
    };
  }

  function browserStorage(getStorage, locks) {
    let revision;
    function read() {
      try {
        return getStorage().getItem(KEY);
      } catch {
        throw Error(
          "Browser storage is unavailable. Open Keplio where storage is allowed, or connect your app’s storage adapter.",
        );
      }
    }
    return {
      load() {
        const raw = read();
        let data;
        try {
          data = raw === null ? { version: 1, items: [] } : JSON.parse(raw);
          validate(data);
        } catch {
          throw Error(
            "Saved Keplio data is invalid. It has not been overwritten.",
          );
        }
        revision = raw;
        return data;
      },
      async save(data) {
        validate(data);
        const write = () => {
          if (revision === undefined)
            throw Error("Reload Keplio before editing.");
          if (read() !== revision)
            throw Error(
              "Another window changed the tracker. Reload before editing; your data was not overwritten.",
            );
          const raw = JSON.stringify(data);
          try {
            getStorage().setItem(KEY, raw);
          } catch {
            throw Error(
              "Browser storage is full or unavailable. Your previous data was not overwritten.",
            );
          }
          revision = raw;
        };
        // Serialize writes across tabs where Web Locks are available.
        if (locks) await locks.request(KEY, write);
        else write();
      },
    };
  }

  if (typeof module !== "undefined")
    module.exports = { KEY, validate, connect, browserStorage };
  else
    global.KeplioStorage = connect(
      global.KeplioStorage ||
        browserStorage(() => global.localStorage, global.navigator?.locks),
    );
})(globalThis);
