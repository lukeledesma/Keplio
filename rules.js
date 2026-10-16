(function (global) {
  const DAY = 86400000;
  const date = (y, m, d) => Date.UTC(y, m, d);
  function now() {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Boise",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
        hourCycle: "h23",
      })
        .formatToParts(new Date())
        .map((x) => [x.type, x.value]),
    );
    return (
      date(+p.year, +p.month - 1, +p.day) +
      (+p.hour * 3600 + +p.minute * 60 + +p.second) * 1000
    );
  }
  function startOfDay(t) {
    return Math.floor(t / DAY) * DAY;
  }
  function end(period, start) {
    const d = new Date(start);
    return period === "day"
      ? start + DAY
      : period === "week"
        ? start + 7 * DAY
        : date(
            d.getUTCFullYear(),
            d.getUTCMonth() + (period === "quarter" ? 3 : 1),
            1,
          );
  }
  function status(k, start, count, target, t = now()) {
    if (start > startOfDay(t)) return "future";
    if (count === -1) return "missed";
    if (count >= target) return "done";
    const dow = new Date(start).getUTCDay(),
      optional =
        k.period === "day" &&
        k.schedule === "weekdays" &&
        (dow === 0 || dow === 6) &&
        count === 0;
    if (optional) return "optional";
    const deadline =
      end(k.period, start) + (k.deadline === "next" ? 8 * 3600000 : 0);
    if (t >= deadline) return "missed";
    return count ? "partial" : "pending";
  }
  function nextEntry(k, start, count, target) {
    const dow = new Date(start).getUTCDay();
    if (
      k.period === "day" &&
      k.schedule === "weekdays" &&
      (dow === 0 || dow === 6)
    )
      return count === 0
        ? -1
        : count === -1
          ? 1
          : count >= target
            ? 0
            : count + 1;
    return count >= target ? 0 : count + 1;
  }
  const api = {
    DAY,
    date,
    now,
    startOfDay,
    end,
    status,
    nextEntry,
    key: (start, slot) =>
      new Date(start).toISOString().slice(0, 10) + "/" + slot,
    sundays: (y, m) => {
      const result = [];
      for (
        let d = 1 + ((7 - new Date(date(y, m, 1)).getUTCDay()) % 7);
        d <= new Date(date(y, m + 1, 0)).getUTCDate();
        d += 7
      )
        result.push(date(y, m, d));
      return result;
    },
  };
  if (typeof module !== "undefined") module.exports = api;
  else global.Rules = api;
})(globalThis);
