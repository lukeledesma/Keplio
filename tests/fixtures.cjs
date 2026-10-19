// Fictional data used only by the browser checks and documentation screenshots.
const item = (id, name, period, target, deadline, marks, description = "") => ({
  id,
  name,
  period,
  target,
  deadline,
  marks,
  description,
  layout: period === "day" ? "calendar" : "rows",
  schedule: "weekdays",
});
const weekly = (counts) =>
  Object.fromEntries(
    counts.map((n, i) => [
      `2026-10-${String(4 + i * 7).padStart(2, "0")}/0`,
      n,
    ]),
  );
const reading = {};
for (let day = 1; day <= 19; day++) {
  if ([0, 6].includes(new Date(Date.UTC(2026, 9, day)).getUTCDay())) continue;
  reading[`2026-10-${String(day).padStart(2, "0")}/0`] =
    day === 8 ? 0 : day === 13 || day === 19 ? 1 : 2;
}
module.exports = {
  version: 1,
  items: [
    item(
      "reading",
      "Reading",
      "day",
      2,
      "none",
      reading,
      "Make time for two reading sessions each weekday.",
    ),
    item(
      "strength",
      "Strength training",
      "week",
      3,
      "end",
      weekly([3, 2, 1]),
      "Complete three strength sessions each week. Each square records a week's progress.",
    ),
    item(
      "learning",
      "Learning sessions",
      "week",
      2,
      "none",
      weekly([2, 1, 1]),
      "Spend time learning something useful twice a week.",
    ),
    item(
      "customers",
      "Customer follow-ups",
      "week",
      5,
      "end",
      weekly([5, 4, 2]),
      "Follow up with five customers each week.",
    ),
    item(
      "improvements",
      "Process improvements",
      "month",
      3,
      "end",
      { "2026-10-01/0": 1 },
      "Make three small improvements each month.",
    ),
    item(
      "sharing",
      "Knowledge sharing",
      "month",
      2,
      "none",
      { "2026-10-01/0": 2 },
      "Share two useful lessons with the team each month.",
    ),
    item(
      "review",
      "Quarterly review",
      "quarter",
      1,
      "end",
      { "2026-01-01/0": 1, "2026-04-01/0": 1, "2026-07-01/0": 0 },
      "Review the quarter and set priorities for the next one.",
    ),
    item(
      "career",
      "Career development",
      "quarter",
      3,
      "none",
      {
        "2026-01-01/0": 3,
        "2026-04-01/0": 2,
        "2026-07-01/0": 3,
        "2026-10-01/0": 1,
      },
      "Take three meaningful steps toward a longer-term goal.",
    ),
  ],
};
