(function (global) {
  const DAY = 86400000;
  const TIME_ZONE = "America/Boise";
  const date = (y, m, d) => Date.UTC(y, m, d);
  // Reuse the formatter: a calendar render evaluates many date statuses.
  const clockFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  });
  function now() {
    const p = Object.fromEntries(
      clockFormatter.formatToParts(new Date()).map((x) => [x.type, x.value]),
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
    if (count === -1 && k.deadline !== "none") return "missed";
    if (count >= target) return "done";
    const dow = new Date(start).getUTCDay(),
      optional =
        k.period === "day" &&
        k.schedule === "weekdays" &&
        (dow === 0 || dow === 6) &&
        count === 0;
    if (optional) return "optional";
    if (k.deadline === "none") return count > 0 ? "partial" : "pending";
    // Older trackers omit deadlineTime; keep their original 8 AM cutoff.
    const [hours, minutes] = (k.deadlineTime ?? "08:00").split(":").map(Number);
    const deadline =
      end(k.period, start) +
      (k.deadline === "next" ? (hours * 60 + minutes) * 60000 : 0);
    if (t >= deadline) return "missed";
    return count ? "partial" : "pending";
  }
  function nextEntry(k, start, count, target) {
    const dow = new Date(start).getUTCDay();
    if (
      k.deadline !== "none" &&
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
    return count >= target ? 0 : Math.max(0, count) + 1;
  }
  // Older target-row trackers store one entry per slot. Read their totals
  // without rewriting saved data; editing a period consolidates only that period.
  function progress(k, start) {
    const prefix = new Date(start).toISOString().slice(0, 10) + "/";
    if (k.period === "week" || (k.period === "day" && k.layout === "calendar"))
      return k.marks[prefix + "0"] || 0;
    const counts = Object.entries(k.marks)
      .filter(([key]) => key.startsWith(prefix))
      .map(([, count]) => count);
    const total = counts.reduce((sum, count) => sum + Math.max(0, count), 0);
    return total || (counts.includes(-1) ? -1 : 0);
  }
  function setProgress(k, start, count) {
    const prefix = new Date(start).toISOString().slice(0, 10) + "/";
    for (const key of Object.keys(k.marks)) {
      if (key.startsWith(prefix)) delete k.marks[key];
    }
    k.marks[prefix + "0"] = count;
  }
  function score(periods) {
    let completed = 0,
      required = 0;
    for (const { state, count, target } of periods) {
      if (state === "future" || !(count > 0 || state === "missed")) continue;
      const credit = Math.min(target, Math.max(0, count));
      completed += credit;
      // Unfinished work only counts against the score once its deadline passes.
      required += state === "missed" ? target : credit;
    }
    return {
      completed,
      required,
      percentage: required
        ? Number(((100 * completed) / required).toFixed(2))
        : 0,
    };
  }
  const api = {
    DAY,
    TIME_ZONE,
    date,
    now,
    startOfDay,
    end,
    status,
    nextEntry,
    progress,
    setProgress,
    score,
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
