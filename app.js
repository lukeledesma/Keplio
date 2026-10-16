(async () => {
  const R = Rules,
    root = document.getElementById("kpi-concept"),
    $ = (id) => root.querySelector("#kt-" + id);
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
        timeZone: "America/Boise",
      }).format(new Date());
    $("quarter").textContent = "Q" + (Math.floor(d.getUTCMonth() / 3) + 1);
    root.querySelector(".preview-label").textContent =
      "Live preview · " +
      new Intl.DateTimeFormat("en-US", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(d);
  }
  function dateLabel(t) {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(t));
  }
  function square(k, start, slot, target, isPreview) {
    const key = R.key(start, slot),
      count = k.marks[key] || 0,
      state = R.status(k, start, count, target);
    const b = el("button", "sq " + state);
    b.type = "button";
    b.dataset.grade = state;
    const weekend =
      k.period === "day" && [0, 6].includes(new Date(start).getUTCDay());
    if (weekend) b.classList.add("weekend");
    b.disabled = state === "future";
    b.setAttribute("aria-pressed", String(state === "done"));
    b.setAttribute(
      "aria-label",
      `${k.name}, ${dateLabel(start)}: ${state === "future" ? "Future — locked" : Math.max(0, count) + "/" + target + " · " + state}`,
    );
    b.title = b.getAttribute("aria-label");
    if (state === "partial")
      b.style.background = `color-mix(in srgb,#3ca34c ${25 + 75 * Math.min(count / target, 1)}%,#17211c)`;
    if (!isPreview)
      b.onclick = () => {
        if (R.status(k, start, count, target) === "future") return;
        commit(() => {
          k.marks[key] = R.nextEntry(k, start, count, target);
        });
      };
    else
      b.onclick = () => {
        if (R.status(k, start, count, target) === "future") return;
        const variant = k.period + "/" + k.layout;
        markBank[variant] ??= {};
        markBank[variant][key] = R.nextEntry(k, start, count, target);
        recordHistory();
        preview();
      };
    return b;
  }
  function row(parent, label, values) {
    const r = el("div", "row");
    r.append(el("span", "label", label));
    for (const value of values)
      r.append(typeof value === "string" ? el("span", "day", value) : value);
    parent.append(r);
  }
  const measure = document.createElement("canvas").getContext("2d");
  function renderKpi(k, preview = false) {
    const section = el("section"),
      head = el("div", "heading"),
      h = el("h3"),
      score = el("span", "meta");
    if (preview) h.textContent = k.name || "New KPI";
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
    const d = new Date(R.now()),
      year = d.getUTCFullYear(),
      month = d.getUTCMonth(),
      qmonth = Math.floor(month / 3) * 3,
      monthName = (m) =>
        new Intl.DateTimeFormat("en-US", {
          month: "short",
          timeZone: "UTC",
        }).format(new Date(R.date(year, m, 1)));
    if (k.period === "day") {
      if (k.layout === "calendar") {
        row(table, "", ["S", "M", "T", "W", "T", "F", "S"]);
        const offset = new Date(R.date(year, month, 1)).getUTCDay(),
          days = new Date(R.date(year, month + 1, 0)).getUTCDate();
        for (let w = 0; w < Math.ceil((offset + days) / 7); w++) {
          const cells = [];
          for (let dow = 0; dow < 7; dow++) {
            const day = w * 7 + dow - offset + 1;
            cells.push(
              day < 1 || day > days
                ? el("span", "day")
                : square(k, R.date(year, month, day), 0, k.target, preview),
            );
          }
          row(
            table,
            offset === 0 ? "W" + (w + 1) : w ? "W" + w : "Prev",
            cells,
          );
        }
      } else {
        const today = R.startOfDay(R.now()),
          start = today - new Date(today).getUTCDay() * R.DAY;
        row(table, "", ["S", "M", "T", "W", "T", "F", "S"]);
        for (let slot = 0; slot < k.target; slot++)
          row(
            table,
            "C" + (slot + 1),
            Array.from({ length: 7 }, (_, i) =>
              square(k, start + i * R.DAY, slot, 1, preview),
            ),
          );
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
        row(
          table,
          monthName(m),
          R.sundays(year, m).map((start) =>
            square(k, start, 0, k.target, preview),
          ),
        );
    } else if (k.period === "month") {
      const months = [qmonth, qmonth + 1, qmonth + 2];
      row(
        table,
        "",
        Array.from({ length: k.target }, (_, slot) => "T" + (slot + 1)),
      );
      for (const m of months)
        row(
          table,
          monthName(m),
          Array.from({ length: k.target }, (_, slot) =>
            square(k, R.date(year, m, 1), slot, 1, preview),
          ),
        );
    } else {
      const cycle = year - (month < 9 ? 1 : 0);
      row(table, "", ["Q4", "Q1", "Q2", "Q3"]);
      for (let slot = 0; slot < k.target; slot++)
        row(
          table,
          "T" + (slot + 1),
          [9, 12, 15, 18].map((m) =>
            square(k, R.date(cycle, m, 1), slot, 1, preview),
          ),
        );
    }
    const squares = [...table.querySelectorAll(".sq")],
      graded = squares.filter((b) =>
        ["done", "missed"].includes(b.dataset.grade),
      ),
      done = graded.filter((b) => b.dataset.grade === "done").length;
    const percentage = graded.length
      ? Number(((100 * done) / graded.length).toFixed(2))
      : 0;
    score.textContent = `${done}/${graded.length} - ${percentage}%`;
    score.title =
      "Completed / graded periods. Pending and optional periods are excluded.";
    measure.font =
      "12px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    const scoreWidth =
      Math.ceil(measure.measureText(score.textContent).width) + 2;
    score.style.width = scoreWidth + "px";
    measure.font =
      "500 14px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    const titleWidth =
      Math.ceil(measure.measureText(k.name || "New KPI").width) + 2;
    const columns = Math.max(
      ...[...table.children].map((r) => r.children.length - 1),
    );
    const tableWidth = 32 + columns * 28;
    head.style.width =
      Math.min(280, Math.max(tableWidth, titleWidth + 10 + scoreWidth)) + "px";
    head.dataset.naturalWidth = head.style.width;
    h.title = k.name || "New KPI";
    return section;
  }
  function bindReorder(button, section, k) {
    let suppress = false;
    const panels = $("panels");
    button.onclick = () => {
      if (!suppress) openForm(k);
    };
    button.onpointerdown = (e) => {
      if (e.button !== 0 || busy || !loaded) return;
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
        children.indexOf(section) < children.indexOf(target)
          ? target.after(section)
          : target.before(section);
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
        captureTarget.removeEventListener("pointermove", move);
        captureTarget.removeEventListener("pointerup", finish);
        captureTarget.removeEventListener("pointercancel", finish);
        if (captureTarget.hasPointerCapture(e.pointerId))
          captureTarget.releasePointerCapture(e.pointerId);
        section.classList.remove("dragging");
        ghost?.remove();
        dragging = false;
        if (event.type === "pointercancel") {
          original.forEach((n) => panels.append(n));
          alignColumns();
        } else if (ghost) {
          const ids = [...panels.children].map((n) => n.dataset.kpiId);
          if (ids.some((id, i) => id !== items[i].id)) {
            await commit(() => {
              items = ids.map((id) => items.find((item) => item.id === id));
            });
          }
        }
        setTimeout(() => {
          suppress = false;
        }, 100);
      };
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
      const from = items.findIndex((item) => item.id === k.id),
        cols = getComputedStyle(panels).gridTemplateColumns.split(" ").length,
        delta = {
          ArrowLeft: -1,
          ArrowRight: 1,
          ArrowUp: -cols,
          ArrowDown: cols,
        }[e.key],
        to = from + delta;
      if (to < 0 || to >= items.length) return;
      await commit(() => {
        const [item] = items.splice(from, 1);
        items.splice(to, 0, item);
      });
      [...panels.children]
        .find((n) => n.dataset.kpiId === k.id)
        ?.querySelector(".kpi-title")
        .focus();
    };
  }
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
  function alignColumns() {
    const panels = $("panels");
    const cards = [...panels.children].filter(
      (node) => node.tagName === "SECTION",
    );
    const count =
      getComputedStyle(panels).gridTemplateColumns.split(" ").length;
    for (let column = 0; column < count; column++) {
      alignCardGroup(cards.filter((_, index) => index % count === column));
    }
    if ($("popup").open) preview();
  }
  new ResizeObserver(alignColumns).observe($("panels"));

  function draw() {
    headingDates();
    $("panels").replaceChildren(...items.map((k) => renderKpi(k)));
    alignColumns();
    if (!items.length) {
      const empty = el(
        "p",
        "muted",
        "Add your first KPI with the + beside the quarter.",
      );
      empty.style.gridColumn = "1 / -1";
      $("panels").append(empty);
    }
  }
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
    const count = getComputedStyle($("panels")).gridTemplateColumns.split(
      " ",
    ).length;
    const existingIndex = cards.findIndex(
      (node) => node.dataset.kpiId === editing,
    );
    const index = existingIndex < 0 ? cards.length : existingIndex;
    const peers = cards.filter(
      (_, i) => i !== existingIndex && i % count === index % count,
    );
    alignCardGroup([...peers, card], [card]);
    $("preview-description").textContent = k.description;
    $("preview-deadline").textContent =
      "Due: " +
      (k.deadline === "next" ? "next day at 8 AM" : "end of each " + k.period) +
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
    for (const field of ["layout", "deadline"]) {
      $(field).parentElement.hidden = !daily;
      $(field).disabled = !daily;
      $(field + "-value").hidden = daily;
    }
    $("layout-value").textContent =
      period === "week" ? "Weekly grid" : "Target rows";
    $("deadline-value").textContent = "End of " + period;
    if (!daily) $("deadline").value = "end";
    $("rule").textContent =
      period === "day" || period === "week"
        ? "Click to increase progress; click at the target to return to 0. Red appears after a missed deadline." +
          (period === "day"
            ? " Weekends on a Weekdays schedule cycle clear → missed → progress → clear; untouched weekends are excluded."
            : "")
        : "Each square represents one completion. Click to toggle it. Unchecked squares turn red after the deadline.";
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
      deadline: "end",
      description: "",
    };
    for (const field of Object.keys(defaults))
      $(field).value = k?.[field] ?? defaults[field];
    $("form-title").textContent = k ? "Edit KPI" : "Add KPI";
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
  for (const field of ["period", "layout", "schedule", "deadline"]) {
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
          "Changing the period or layout starts a new set of entries for this KPI. Its previous entries will be replaced when you save. Continue?",
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

  try {
    const state = await KeplioStorage.load();
    items = state.items;
    loaded = true;
    draw();
  } catch (e) {
    notify(e.message);
  }
  setInterval(() => {
    if (!busy && !dragging) {
      draw();
    }
  }, 30000);
})();
