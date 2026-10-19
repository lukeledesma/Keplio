(async () => {
  const R = Rules,
    root = document.getElementById("kpi-concept"),
    $ = (id) => root.querySelector("#kt-" + id);
  // View state and editor draft history.
  let selectedQuarter = null;
  const calendarViews = new Map();
  function calendarView(id) {
    const fallback =
      viewQuarter() === quarterStart()
        ? new Date(R.now()).getUTCMonth() % 3
        : 0;
    const saved = calendarViews.get(id) || {};
    return { month: saved.month ?? fallback };
  }
  function resetCalendarMonths() {
    calendarViews.clear();
  }
  function quarterStart(t = R.now()) {
    const d = new Date(t);
    return R.date(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1);
  }
  function viewQuarter() {
    return selectedQuarter ?? quarterStart();
  }
  let items = [],
    loaded = false,
    busy = false,
    dragging = false,
    editing = null;
  let draftId = null,
    markBank = {},
    history = [],
    historyIndex = -1;
  const editorFields = [
    "name",
    "period",
    "target",
    "layout",
    "schedule",
    "deadline",
    "deadlineTime",
    "description",
  ];
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  let noticeTimer;
  function notify(text = "") {
    clearTimeout(noticeTimer);
    const status = $("status");
    status.textContent = text;
    status.classList.toggle("error", Boolean(text));
    if (text) {
      noticeTimer = setTimeout(() => {
        status.textContent = "";
        status.classList.remove("error");
      }, 5000);
    }
  }
  // Save atomically from the UI perspective: failed writes restore the prior state.
  async function commit(update) {
    if (busy || !loaded) return false;
    busy = true;
    root.classList.add("busy");
    const previous = structuredClone(items);
    try {
      update();
      draw();
      await KeplioStorage.save({ version: 1, items });
      notify("");
      return true;
    } catch (e) {
      items = previous;
      draw();
      notify("Not saved: " + e.message);
      return false;
    } finally {
      busy = false;
      root.classList.remove("busy");
    }
  }
  // Dates and accessible labels.
  function headingDates() {
    const t = R.now(),
      d = new Date(t),
      day = d.getUTCDate(),
      suffix =
        day % 100 >= 11 && day % 100 <= 13
          ? "th"
          : { 1: "st", 2: "nd", 3: "rd" }[day % 10] || "th";
    root.querySelector(".sub h2").textContent =
      new Intl.DateTimeFormat("en-US", {
        month: "long",
        timeZone: "UTC",
      }).format(d) +
      " " +
      day +
      suffix +
      " " +
      d.getUTCFullYear();
    root.querySelector(".date-tools>.muted").textContent =
      new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: R.TIME_ZONE,
      }).format(new Date());
    const viewed = new Date(viewQuarter());
    $("quarter").textContent =
      `Q${Math.floor(viewed.getUTCMonth() / 3) + 1} ${viewed.getUTCFullYear()}`;
    $("preview-quarter").textContent = $("quarter").textContent;
  }
  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const monthFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  const longMonthFormatter = new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: "UTC",
  });
  function dateLabel(t) {
    return dateFormatter.format(new Date(t));
  }
  function weekLabel(start) {
    return dateFormatter.formatRange(
      new Date(start),
      new Date(start + 6 * R.DAY),
    );
  }
  // Shared heatmap rendering for daily, weekly, monthly and quarterly trackers.
  function square(k, start, target, isPreview, renderTime) {
    const count = R.progress(k, start),
      state = R.status(k, start, count, target, renderTime);
    const b = el("button", "sq " + state);
    b.type = "button";
    const today = R.startOfDay(renderTime);
    if (
      (k.period === "day" && start === today) ||
      (k.period === "week" && start <= today && today < start + 7 * R.DAY)
    ) {
      b.classList.add("today");
      b.setAttribute("aria-current", "date");
    }
    b.dataset.grade = state;
    b.dataset.count = Math.max(0, count);
    b.dataset.target = target;
    const weekend =
      k.period === "day" && [0, 6].includes(new Date(start).getUTCDay());
    if (weekend) b.classList.add("weekend");
    b.disabled = state === "future";
    b.setAttribute("aria-pressed", String(state === "done"));
    const partialProgress = state !== "future" && count > 0 && count < target;
    const statusLabel =
      partialProgress && state === "missed" ? "partial · overdue" : state;
    b.setAttribute(
      "aria-label",
      `${k.name}, ${k.period === "week" ? weekLabel(start) : dateLabel(start)}: ${state === "future" ? "Future — locked" : Math.max(0, count) + "/" + target + " · " + statusLabel}`,
    );
    b.title = b.getAttribute("aria-label");
    // Keep progress visible after a deadline; grading still uses the original status.
    if (partialProgress)
      b.style.background = `color-mix(in srgb, var(--green) ${25 + 75 * (count / target)}%, #17211c)`;
    if (!isPreview)
      b.onclick = () => {
        if (R.status(k, start, count, target) === "future") return;
        commit(() => {
          R.setProgress(k, start, R.nextEntry(k, start, count, target));
        });
      };
    else
      b.onclick = () => {
        if (R.status(k, start, count, target) === "future") return;
        const variant = k.period + "/" + k.layout;
        markBank[variant] ??= {};
        R.setProgress(
          { ...k, marks: markBank[variant] },
          start,
          R.nextEntry(k, start, count, target),
        );
        recordHistory();
        preview();
      };
    return b;
  }
  function row(parent, label, values, tooltip) {
    const r = el("div", "row");
    const rowLabel = el("span", "label", label);
    if (tooltip) {
      rowLabel.title = tooltip;
      rowLabel.setAttribute("aria-label", `${label}: ${tooltip}`);
    }
    r.append(rowLabel);
    for (const value of values)
      r.append(typeof value === "string" ? el("span", "day", value) : value);
    parent.append(r);
  }
  const measure = document.createElement("canvas").getContext("2d");
  function renderKpi(k, isPreview = false) {
    const renderTime = R.now();
    const cell = (start) => square(k, start, k.target, isPreview, renderTime);
    const section = el("section"),
      head = el("div", "heading"),
      h = el("h3"),
      score = el("span", "meta");
    if (isPreview) h.textContent = k.name || "New tracker";
    else {
      const b = el("button", "kpi-title", k.name);
      b.title = k.name;
      b.setAttribute(
        "aria-label",
        k.name + ". Click to edit; drag to reorder, or use Alt and arrow keys.",
      );
      bindReorder(b, section, k);
      h.append(b);
    }
    section.dataset.kpiId = k.id;
    head.append(h, score);
    section.append(head);
    const table = el("div", "preview-table");
    section.append(table);
    const d = new Date(viewQuarter()),
      year = d.getUTCFullYear(),
      month = d.getUTCMonth(),
      qmonth = Math.floor(month / 3) * 3,
      monthName = (m) => monthFormatter.format(new Date(R.date(year, m, 1)));
    if (k.period === "day") {
      const view = calendarView(k.id);
      const changeView = (next) => {
        const focused = section.contains(document.activeElement)
          ? document.activeElement.getAttribute("aria-label")
          : null;
        calendarViews.set(k.id, next);
        if (isPreview) {
          preview();
        } else {
          draw();
        }
        const container = isPreview ? $("preview") : $("panels");
        const updated = [...container.children].find(
          (card) => card.dataset.kpiId === k.id,
        );
        if (!updated) return;
        if (focused) {
          const calendar = updated.querySelector(
            ".month-calendar:not([hidden])",
          );
          const buttons = [...calendar.querySelectorAll(".month-arrow")];
          (
            buttons.find(
              (button) =>
                button.getAttribute("aria-label") === focused &&
                !button.disabled,
            ) || buttons.find((button) => !button.disabled)
          )?.focus({ preventScroll: true });
        }
      };
      for (const m of [qmonth, qmonth + 1, qmonth + 2]) {
        const calendar = el("div", "month-calendar");
        calendar.hidden = m !== qmonth + view.month;
        table.append(calendar);
        const offset = new Date(R.date(year, m, 1)).getUTCDay(),
          days = new Date(R.date(year, m + 1, 0)).getUTCDate();
        row(calendar, monthName(m).toUpperCase(), [
          "S",
          "M",
          "T",
          "W",
          "T",
          "F",
          "S",
        ]);
        const monthLabel = calendar.querySelector(".label");
        monthLabel.classList.add("month-label");
        {
          const arrow = (delta, symbol, label) => {
            const button = el(
              "button",
              "month-arrow " + (delta < 0 ? "month-previous" : "month-next"),
              symbol,
            );
            button.type = "button";
            button.setAttribute("aria-label", label);
            button.title = label;
            button.disabled = view.month + delta < 0 || view.month + delta > 2;
            button.onclick = () =>
              changeView({ ...view, month: view.month + delta });
            return button;
          };
          calendar.append(
            arrow(-1, "‹", "Previous month"),
            arrow(1, "›", "Next month"),
          );
        }
        for (let w = 0; w < Math.ceil((offset + days) / 7); w++) {
          const cells = [];
          for (let dow = 0; dow < 7; dow++) {
            const day = w * 7 + dow - offset + 1;
            cells.push(
              day < 1 || day > days
                ? el("span", "day")
                : cell(R.date(year, m, day)),
            );
          }
          const weekStart = R.date(year, m, w * 7 - offset + 1);
          // Number the week in the month where its Sunday falls, including carryover weeks.
          const label = "W" + Math.ceil(new Date(weekStart).getUTCDate() / 7);
          const previousMonth = longMonthFormatter.format(new Date(weekStart));
          const tooltip =
            weekLabel(weekStart) +
            (w === 0 && offset !== 0
              ? `. Week started in ${previousMonth}.`
              : "");
          row(calendar, label, cells, tooltip);
          if (w === 0 && offset !== 0) {
            calendar.lastElementChild
              .querySelector(".label")
              .classList.add("carryover-week");
          }
        }
      }
    } else if (k.period === "week") {
      const months = [qmonth, qmonth + 1, qmonth + 2],
        max = Math.max(...months.map((m) => R.sundays(year, m).length));
      row(
        table,
        "",
        Array.from({ length: max }, (_, i) => "W" + (i + 1)),
      );
      for (const m of months)
        row(table, monthName(m), R.sundays(year, m).map(cell));
    } else if (k.period === "month") {
      const months = [qmonth, qmonth + 1, qmonth + 2];
      row(table, "", months.map(monthName));
      row(
        table,
        "Q" + (qmonth / 3 + 1),
        months.map((m) => cell(R.date(year, m, 1))),
      );
    } else {
      row(table, "", ["Q1", "Q2", "Q3", "Q4"]);
      row(
        table,
        String(year),
        [0, 3, 6, 9].map((m) => {
          const start = R.date(year, m, 1);
          const square = cell(start);
          square.classList.toggle("selected-quarter", start === viewQuarter());
          square.classList.toggle("past-quarter", start < viewQuarter());
          return square;
        }),
      );
    }
    const squares = [
      ...table.querySelectorAll(
        k.period === "quarter" ? ".sq.selected-quarter" : ".sq",
      ),
    ];
    const { completed, required, percentage } = R.score(
      squares.map((b) => ({
        state: b.dataset.grade,
        count: Number(b.dataset.count),
        target: Number(b.dataset.target),
      })),
    );
    score.textContent = `${completed}/${required} - ${percentage}%`;
    score.title =
      "Selected quarter: recorded progress / recorded progress plus missed work. Unfinished targets count against the score only after their deadlines. The square's color shows progress toward its full target.";
    measure.font =
      "11px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    const scoreWidth =
      Math.ceil(measure.measureText(score.textContent).width) + 2;
    score.style.width = scoreWidth + "px";
    measure.font =
      "500 14px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    const titleWidth =
      Math.ceil(measure.measureText(k.name || "New tracker").width) + 2;
    const columns = Math.max(
      ...[...table.querySelectorAll(".row")].map((r) => r.children.length - 1),
    );
    const tableWidth = 32 + columns * 28;
    head.style.width =
      Math.min(280, Math.max(tableWidth, titleWidth + 10 + scoreWidth)) + "px";
    head.dataset.naturalWidth = head.style.width;
    h.title = k.name || "New tracker";
    return section;
  }
  // Pointer and keyboard reordering.
  function bindReorder(button, section, k) {
    let suppress = false;
    const panels = $("panels");
    button.onclick = () => {
      if (!suppress) openForm(k);
    };
    button.onpointerdown = (e) => {
      if (e.button !== 0 || busy || !loaded || dragging) return;
      suppress = false;
      const captureTarget = button;
      const content = [...section.children].map((node) =>
        node.getBoundingClientRect(),
      );
      const rect = {
        left: Math.min(...content.map((r) => r.left)),
        top: Math.min(...content.map((r) => r.top)),
        right: Math.max(...content.map((r) => r.right)),
        bottom: Math.max(...content.map((r) => r.bottom)),
      };
      rect.width = rect.right - rect.left;
      rect.height = rect.bottom - rect.top;
      const original = [...panels.children],
        x = e.clientX,
        y = e.clientY,
        dx = x - rect.left,
        dy = y - rect.top;
      let ghost = null,
        last = null;
      dragging = true;
      captureTarget.setPointerCapture(e.pointerId);
      const move = (event) => {
        if (event.pointerId !== e.pointerId) return;
        if (!ghost && Math.hypot(event.clientX - x, event.clientY - y) < 7)
          return;
        if (!ghost) {
          suppress = true;
          ghost = section.cloneNode(true);
          ghost.removeAttribute("data-kpi-id");
          ghost.classList.add("drag-ghost");
          ghost.setAttribute("aria-hidden", "true");
          ghost.inert = true;
          [...ghost.children].forEach((child, index) => {
            child.style.marginLeft = content[index].left - rect.left + "px";
            child.style.marginRight = "0";
          });
          ghost.style.width = rect.width + "px";
          ghost.style.height = rect.height + "px";
          root.append(ghost);
          section.classList.add("dragging");
        }
        const bounds = root.getBoundingClientRect();
        ghost.style.left = event.clientX - bounds.left - dx + "px";
        ghost.style.top = event.clientY - bounds.top - dy + "px";
        const target = document
          .elementFromPoint(event.clientX, event.clientY)
          ?.closest("#kt-panels>section");
        if (target === section) last = null;
        if (!target || target === section || target === last) return;
        last = target;
        const children = [...panels.children],
          before = new Map(children.map((n) => [n, n.getBoundingClientRect()]));
        // Preview a swap from the original order so passing other cards
        // does not shuffle them permanently on the way to the destination.
        const next = [...original];
        const from = original.indexOf(section),
          to = children.indexOf(target);
        [next[from], next[to]] = [next[to], next[from]];
        next.forEach((node) => panels.append(node));
        alignColumns();
        captureTarget.setPointerCapture(e.pointerId);
        for (const node of children) {
          if (node === section) continue;
          const a = before.get(node);
          node.getAnimations().forEach((animation) => animation.cancel());
          const b = node.getBoundingClientRect();
          if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
            node.animate(
              [
                {
                  transform: `translate(${a.left - b.left}px,${a.top - b.top}px)`,
                },
                { transform: "translate(0,0)" },
              ],
              { duration: 180, easing: "ease-out" },
            );
        }
      };
      const finish = async (event) => {
        if (event.pointerId !== e.pointerId) return;
        document.removeEventListener("keydown", cancelOnEscape, true);
        captureTarget.removeEventListener("pointermove", move);
        captureTarget.removeEventListener("pointerup", finish);
        captureTarget.removeEventListener("pointercancel", finish);
        if (captureTarget.hasPointerCapture(e.pointerId))
          captureTarget.releasePointerCapture(e.pointerId);
        section.classList.remove("dragging");
        ghost?.remove();
        dragging = false;
        if (event.type === "pointercancel") {
          original.forEach((n) => {
            n.getAnimations().forEach((animation) => animation.cancel());
            panels.append(n);
          });
          alignColumns();
        } else if (ghost) {
          const ids = [...panels.children].map((n) => n.dataset.kpiId);
          if (ids.some((id, i) => id !== items[i].id)) {
            await commit(() => {
              items = ids.map((id) => items.find((item) => item.id === id));
            });
          }
        }
        // Escape may happen while the mouse is still held; suppress its later click.
        if (event.type !== "pointercancel")
          setTimeout(() => {
            suppress = false;
          }, 100);
      };
      const cancelOnEscape = (event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        suppress = true;
        finish({ pointerId: e.pointerId, type: "pointercancel" });
      };
      document.addEventListener("keydown", cancelOnEscape, true);
      captureTarget.addEventListener("pointermove", move);
      captureTarget.addEventListener("pointerup", finish);
      captureTarget.addEventListener("pointercancel", finish);
    };
    button.onkeydown = async (e) => {
      if (
        !e.altKey ||
        !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key) ||
        busy ||
        dragging
      )
        return;
      e.preventDefault();
      const from = items.findIndex((item) => item.id === k.id);
      let to = from + (e.key === "ArrowUp" ? -1 : 1);
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const cards = [...panels.children];
        const columns = cardColumns(cards);
        const targetColumn = columns[from] + (e.key === "ArrowLeft" ? -1 : 1);
        const top = section.getBoundingClientRect().top;
        to = -1;
        let nearest = Infinity;
        cards.forEach((card, index) => {
          const distance = Math.abs(card.getBoundingClientRect().top - top);
          if (columns[index] === targetColumn && distance < nearest) {
            nearest = distance;
            to = index;
          }
        });
      }
      if (to < 0 || to >= items.length) return;
      await commit(() => {
        [items[from], items[to]] = [items[to], items[from]];
      });
      [...panels.children]
        .find((n) => n.dataset.kpiId === k.id)
        ?.querySelector(".kpi-title")
        .focus();
    };
  }
  // Responsive columns and shared row positions.
  function alignCardGroup(group, targets = group) {
    const widest = Math.max(
      0,
      ...group.flatMap((card) => [
        parseFloat(card.querySelector(".heading").dataset.naturalWidth),
        card.querySelector(".preview-table").getBoundingClientRect().width,
      ]),
    );
    for (const card of targets) {
      // Hidden dialogs have no layout width; retain the natural header until shown.
      if (!card.clientWidth) continue;
      const width = Math.min(widest, card.clientWidth);
      card.querySelector(".heading").style.width = width + "px";
      const inset = Math.max(0, (card.clientWidth - width) / 2);
      for (const child of card.children) {
        child.style.marginLeft = inset + "px";
        child.style.marginRight = "0";
      }
      if (group.length === 1) {
        const table = card.querySelector(".preview-table");
        table.style.marginLeft = "auto";
        table.style.marginRight = "auto";
      }
    }
  }
  function cardColumns(cards) {
    const padding = parseFloat(getComputedStyle(root).paddingLeft) * 2;
    const available = matchMedia("(max-width: 800px)").matches
      ? 1
      : Math.max(1, Math.floor((innerWidth - padding + 99) / (280 + 99)));
    const count = Math.min(available, Math.max(1, Math.ceil(cards.length / 3)));
    const perColumn = Math.max(3, Math.ceil(cards.length / count));
    return cards.map((_, index) => Math.floor(index / perColumn));
  }
  function alignColumns() {
    const panels = $("panels");
    const cards = [...panels.children].filter(
      (node) => node.tagName === "SECTION",
    );
    const columns = cardColumns(cards);
    const count = Math.max(1, (columns.at(-1) ?? 0) + 1);
    panels.style.setProperty("--column-count", count);
    for (let column = 0; column < count; column++) {
      alignCardGroup(cards.filter((_, index) => columns[index] === column));
    }
    // Share row positions; narrow screens allow more rows per column.
    const rowHeights = [];
    const usedRows = Array(count).fill(0);
    const placements = cards.map((card, index) => {
      const column = columns[index];
      const row = usedRows[column]++;
      const height = Math.ceil(card.getBoundingClientRect().height);
      rowHeights[row] = Math.max(rowHeights[row] || 0, height);
      return { card, column, row, height };
    });
    const starts = [];
    let nextStart = 1;
    rowHeights.forEach((height) => {
      starts.push(nextStart);
      nextStart += height + 38;
    });
    placements.forEach(({ card, column, row, height }) => {
      card.style.gridColumn = String(column + 1);
      card.style.gridRow = `${starts[row]} / span ${height}`;
    });
    // Match the page chrome to the content inside the outer tracker columns.
    const first = cards[0];
    const last = cards.at(-1);
    const firstHeading = first?.querySelector(".heading");
    const lastHeading = last?.querySelector(".heading");
    const leftInset = firstHeading
      ? parseFloat(firstHeading.style.marginLeft) || 0
      : 0;
    const rightInset = lastHeading
      ? Math.max(
          0,
          last.clientWidth -
            (parseFloat(lastHeading.style.marginLeft) || 0) -
            lastHeading.getBoundingClientRect().width,
        )
      : 0;
    root.style.setProperty("--content-left", `${leftInset}px`);
    root.style.setProperty("--content-right", `${rightInset}px`);
    if ($("popup").open) preview();
  }
  new ResizeObserver(alignColumns).observe($("panels"));
  window.addEventListener("resize", alignColumns);

  function draw() {
    headingDates();
    $("panels").replaceChildren(...items.map((k) => renderKpi(k)));
    alignColumns();
    if (!items.length) {
      const empty = el(
        "p",
        "muted",
        "Add your first tracker with the + beside the quarter.",
      );
      empty.style.gridColumn = "1 / -1";
      empty.style.gridRow = "1 / span 60";
      $("panels").append(empty);
    }
  }
  function navigateQuarter(delta) {
    if (dragging || busy) return;
    const d = new Date(viewQuarter());
    selectedQuarter = R.date(
      d.getUTCFullYear(),
      d.getUTCMonth() + delta * 3,
      1,
    );
    resetCalendarMonths();
    draw();
  }
  $("previous-quarter").onclick = () => navigateQuarter(-1);
  $("next-quarter").onclick = () => navigateQuarter(1);
  $("preview-previous-quarter").onclick = () => navigateQuarter(-1);
  $("preview-next-quarter").onclick = () => navigateQuarter(1);
  // Editor state, preview, undo/redo and persistence.
  function draft() {
    const period = $("period").value,
      layout = $("layout").value,
      target = Number($("target").value);
    return {
      id: editing || draftId,
      name: $("name").value.trim(),
      description: $("description").value.trim(),
      period,
      layout,
      target,
      schedule: $("schedule").value,
      deadline: $("deadline").value,
      deadlineTime: $("deadlineTime").value || "08:00",
      marks: structuredClone(markBank[period + "/" + layout] || {}),
    };
  }
  function editorSnapshot() {
    return {
      fields: Object.fromEntries(editorFields.map((f) => [f, $(f).value])),
      marks: structuredClone(markBank),
    };
  }
  function historyButtons() {
    $("undo").disabled = historyIndex <= 0;
    $("redo").disabled = historyIndex >= history.length - 1;
  }
  function recordHistory() {
    const state = editorSnapshot();
    if (JSON.stringify(state) === JSON.stringify(history[historyIndex])) return;
    history = history.slice(0, historyIndex + 1);
    history.push(state);
    if (history.length > 100) history.shift();
    historyIndex = history.length - 1;
    historyButtons();
  }
  function restoreHistory(delta) {
    const index = historyIndex + delta;
    if (index < 0 || index >= history.length) return;
    closeChoices();
    historyIndex = index;
    const state = history[index];
    $("layout").replaceChildren(
      new Option("Target rows", "rows"),
      new Option("Calendar", "calendar"),
    );
    for (const f of editorFields) $(f).value = state.fields[f];
    markBank = structuredClone(state.marks);
    settings();
    historyButtons();
  }
  function preview() {
    const k = draft();
    k.target = Math.max(1, Math.min(30, k.target || 1));
    const card = renderKpi(k, true);
    $("preview").replaceChildren(card);
    const cards = [...$("panels").children].filter(
      (node) => node.tagName === "SECTION",
    );
    const existingIndex = cards.findIndex(
      (node) => node.dataset.kpiId === editing,
    );
    const index = existingIndex < 0 ? cards.length : existingIndex;
    const proposed = [...cards];
    proposed[index] = card;
    const columns = cardColumns(proposed);
    const peers = proposed.filter(
      (_, i) => i !== index && columns[i] === columns[index],
    );
    alignCardGroup([...peers, card], [card]);
    $("preview-description").textContent = k.description;
    $("preview-deadline").textContent =
      k.deadline === "none"
        ? "No deadline. Unmarked periods stay empty; progress never becomes overdue. Future periods stay locked."
        : "Due: " +
          (k.deadline === "next"
            ? "next day at " +
              new Intl.DateTimeFormat("en-US", {
                hour: "numeric",
                minute: "2-digit",
                timeZone: "UTC",
              }).format(new Date("2000-01-01T" + k.deadlineTime + ":00Z"))
            : "end of each " + k.period) +
          ". Below target after the deadline is missed. Future periods stay locked; past periods remain editable.";
  }
  function settings() {
    const period = $("period").value,
      selected = $("layout").value;
    $("layout").replaceChildren(
      new Option(period === "week" ? "Weekly grid" : "Target rows", "rows"),
    );
    if (period === "day") $("layout").add(new Option("Calendar", "calendar"));
    $("layout").value =
      period === "day" && selected === "calendar" ? "calendar" : "rows";
    $("target-label").textContent =
      period === "day" ? "Daily target" : "Target";
    $("schedule-wrap").hidden = period !== "day";
    const daily = period === "day";
    $("layout").disabled = true;
    const nextDay = $("deadline").querySelector('[value="next"]');
    nextDay.disabled = !daily;
    if (!daily && $("deadline").value === "next") $("deadline").value = "end";
    $("deadline").querySelector('[value="end"]').textContent =
      "End of " + period;
    const nextDaySelected = daily && $("deadline").value === "next";
    $("deadline-time-wrap").hidden = !nextDaySelected;
    $("deadlineTime").disabled = !nextDaySelected;
    const strict = $("deadline").value !== "none";
    $("rule").textContent =
      "Each square is one " +
      period +
      ". Click to increase progress; click at the target to return to 0. Green gets brighter as progress increases." +
      (strict
        ? " Empty periods turn red after the deadline."
        : " Unmarked periods stay empty.") +
      (daily && $("schedule").value === "weekdays" && strict
        ? " Weekends cycle clear → missed → progress → clear; untouched weekends are excluded."
        : "");
    syncChoices();
    preview();
  }
  function openForm(k) {
    if (busy || !loaded) return;
    editing = k?.id || null;
    draftId = k?.id || crypto.randomUUID();
    markBank = k
      ? { [k.period + "/" + k.layout]: structuredClone(k.marks) }
      : {};
    history = [];
    historyIndex = -1;
    closeChoices();
    $("layout").replaceChildren(
      new Option("Target rows", "rows"),
      new Option("Calendar", "calendar"),
    );
    const defaults = {
      name: "",
      period: "day",
      layout: "calendar",
      target: 1,
      schedule: "weekdays",
      deadline: "none",
      deadlineTime: "08:00",
      description: "",
    };
    for (const field of Object.keys(defaults))
      $(field).value = k?.[field] ?? defaults[field];
    $("form-title").textContent = k ? "Edit tracker" : "Add tracker";
    $("remove").hidden = !k;
    settings();
    recordHistory();
    $("popup").showModal();
    preview();
    $("name").focus();
  }
  function close() {
    closeChoices();
    $("popup").close();
  }

  // Keyboard-accessible select menus.
  const choiceControls = [];
  function closeChoices() {
    for (const c of choiceControls) {
      c.menu.hidden = true;
      c.button.setAttribute("aria-expanded", "false");
    }
  }
  function syncChoices() {
    for (const c of choiceControls) {
      c.text.textContent = c.select.selectedOptions[0]?.textContent || "";
      c.button.disabled = c.select.disabled;
    }
  }
  for (const field of ["period", "schedule", "deadline"]) {
    const select = $(field),
      shell = select.parentElement;
    select.hidden = true;
    const button = el("button", "choice-trigger"),
      text = el("span"),
      arrow = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    arrow.setAttribute("viewBox", "0 0 16 16");
    arrow.setAttribute("aria-hidden", "true");
    arrow.innerHTML =
      '<path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>';
    button.type = "button";
    button.setAttribute("aria-label", field[0].toUpperCase() + field.slice(1));
    button.setAttribute("aria-haspopup", "listbox");
    button.setAttribute("aria-expanded", "false");
    const menu = el("div", "choice-menu");
    menu.id = "kt-" + field + "-choices";
    menu.hidden = true;
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", field + " options");
    button.setAttribute("aria-controls", menu.id);
    button.append(text, arrow);
    shell.append(button, menu);
    const control = { select, button, text, menu };
    choiceControls.push(control);
    function openChoices() {
      closeChoices();
      menu.replaceChildren();
      for (const option of select.options) {
        if (option.disabled) continue;
        const item = el("button", "choice-option"),
          check = el("span", "choice-check", option.selected ? "✓" : "");
        item.type = "button";
        item.setAttribute("role", "option");
        item.setAttribute("aria-selected", String(option.selected));
        item.tabIndex = option.selected ? 0 : -1;
        item.append(check, el("span", "", option.textContent));
        item.onclick = (e) => {
          e.preventDefault();
          select.value = option.value;
          closeChoices();
          settings();
          recordHistory();
          button.focus();
        };
        menu.append(item);
      }
      menu.hidden = false;
      button.setAttribute("aria-expanded", "true");
      (
        menu.querySelector('[aria-selected="true"]') || menu.firstElementChild
      )?.focus();
    }
    button.onclick = (e) => {
      e.preventDefault();
      if (menu.hidden) openChoices();
      else closeChoices();
    };
    button.onkeydown = (e) => {
      if (["ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        openChoices();
      }
    };
    menu.onkeydown = (e) => {
      const options = [...menu.children],
        index = options.indexOf(document.activeElement);
      let next;
      if (e.key === "ArrowDown") next = (index + 1) % options.length;
      if (e.key === "ArrowUp")
        next = (index - 1 + options.length) % options.length;
      if (e.key === "Home") next = 0;
      if (e.key === "End") next = options.length - 1;
      if (next !== undefined) {
        e.preventDefault();
        options[next].focus();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeChoices();
        button.focus();
      } else if (e.key === "Tab") {
        closeChoices();
        button.focus();
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        const match =
          options.find(
            (n, i) =>
              i > index &&
              n.textContent
                .trim()
                .replace("✓", "")
                .trim()
                .toLowerCase()
                .startsWith(e.key.toLowerCase()),
          ) ||
          options.find((n) =>
            n.textContent
              .replace("✓", "")
              .trim()
              .toLowerCase()
              .startsWith(e.key.toLowerCase()),
          );
        match?.focus();
      }
    };
  }
  document.addEventListener("pointerdown", (e) => {
    if (!e.target.closest(".select-shell")) closeChoices();
  });
  $("popup").addEventListener("close", closeChoices);

  $("add").onclick = () => openForm(null);
  $("close").onclick = close;
  $("cancel").onclick = close;
  for (const field of editorFields)
    $(field).oninput = () => {
      settings();
      recordHistory();
    };
  $("undo").onclick = () => restoreHistory(-1);
  $("redo").onclick = () => restoreHistory(1);
  $("editor").onsubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const next = draft();
    if (!next.name) return;
    const old = items.find((k) => k.id === editing);
    if (
      old &&
      (old.period !== next.period || old.layout !== next.layout) &&
      Object.keys(old.marks).length
    ) {
      if (
        !confirm(
          "Changing the period or layout starts a new set of entries for this tracker. Its previous entries will be replaced when you save. Continue?",
        )
      )
        return;
    }
    if (
      await commit(() => {
        if (old) items[items.indexOf(old)] = next;
        else items.push(next);
      })
    ) {
      close();
    }
  };
  $("remove").onclick = async () => {
    const item = items.find((k) => k.id === editing);
    if (!item) return;
    const dialog = $("delete-dialog");
    $("delete-message").textContent =
      `Delete “${item.name}” and all of its recorded progress? This cannot be undone.`;
    dialog.returnValue = "cancel";
    const confirmed = new Promise((resolve) => {
      dialog.addEventListener(
        "close",
        () => resolve(dialog.returnValue === "delete"),
        { once: true },
      );
    });
    dialog.showModal();
    if (!(await confirmed)) return;
    if (
      await commit(() => {
        const index = items.findIndex((k) => k.id === item.id);
        if (index >= 0) items.splice(index, 1);
      })
    )
      close();
  };

  // Initial load and time-sensitive refresh.
  try {
    const state = await KeplioStorage.load();
    items = state.items;
    loaded = true;
    draw();
  } catch (e) {
    notify(e.message);
  }
  function refreshWhenVisible() {
    if (loaded && !busy && !dragging && !document.hidden) draw();
  }
  setInterval(refreshWhenVisible, 30000);
  document.addEventListener("visibilitychange", refreshWhenVisible);
})();
