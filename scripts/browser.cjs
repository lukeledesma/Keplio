// Optional development tool: npm install --no-save --package-lock=false playwright
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");
const fixture = require("../tests/fixtures.cjs");
const root = path.resolve(__dirname, "..");
const screenshotMode = process.argv.includes("--screenshots");

(async () => {
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      const file = path.resolve(
        root,
        "." + (pathname === "/" ? "/index.html" : pathname),
      );
      if (!file.startsWith(root + path.sep)) throw Error("Invalid path");
      const types = {
        ".html": "text/html",
        ".css": "text/css",
        ".js": "text/javascript",
        ".png": "image/png",
      };
      res.setHeader(
        "Content-Type",
        types[path.extname(file)] || "application/octet-stream",
      );
      res.end(await fs.readFile(file));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: 1360, height: 850 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.clock.setFixedTime(new Date("2026-10-19T20:30:00Z"));
    await page.addInitScript((data) => {
      if (!localStorage.getItem("keplio.v1"))
        localStorage.setItem("keplio.v1", JSON.stringify(data));
    }, fixture);
    const url = `http://127.0.0.1:${server.address().port}/`;
    await page.goto(url);
    await page.locator("#kt-panels > section").last().waitFor();
    const saved = await page.evaluate(() => localStorage.getItem("keplio.v1"));
    const set = async (id, value) =>
      page.locator("#kt-" + id).evaluate((node, value) => {
        node.value = String(value);
        node.dispatchEvent(new Event("input", { bubbles: true }));
      }, value);
    const card = (id) => page.locator(`[data-kpi-id="${id}"]`).first();
    const meta = (id) => card(id).locator(".meta").textContent();
    assert.equal(await meta("improvements"), "1/1 - 100%");
    assert.equal(await meta("career"), "1/1 - 100%");
    assert.equal(await card("review").locator(".past-quarter").count(), 3);
    assert.equal(
      await card("review")
        .locator(".past-quarter.done")
        .first()
        .evaluate((e) => getComputedStyle(e).opacity),
      "0.5",
    );
    assert.equal(
      await card("review")
        .locator(".past-quarter.missed")
        .evaluate((e) => getComputedStyle(e).opacity),
      "0.5",
    );
    if (screenshotMode) {
      await fs.mkdir(path.join(root, "docs/screenshots"), { recursive: true });
      await page.screenshot({
        path: path.join(root, "docs/screenshots/overview.png"),
      });
      await card("strength").locator(".kpi-title").click();
      await page.locator("#kt-name").blur();
      await page
        .locator("#kt-popup")
        .screenshot({ path: path.join(root, "docs/screenshots/editor.png") });
      await page.locator("#kt-cancel").click();
    }
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const mobile = await mobileContext.newPage();
    mobile.on("pageerror", (error) => errors.push(error.message));
    await mobile.clock.setFixedTime(new Date("2026-10-19T20:30:00Z"));
    await mobile.addInitScript(
      (data) => localStorage.setItem("keplio.v1", JSON.stringify(data)),
      fixture,
    );
    await mobile.goto(url);
    await mobile.locator("#kt-panels > section").last().waitFor();
    assert.ok(
      await mobile.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.equal(
      await mobile
        .locator(".month-calendar:not([hidden]) .month-next")
        .evaluate((e) => getComputedStyle(e).opacity),
      "1",
    );
    if (screenshotMode)
      await mobile.screenshot({
        path: path.join(root, "docs/screenshots/mobile.png"),
        fullPage: true,
      });
    await mobile.locator("#kt-add").tap();
    assert.ok(
      await mobile
        .locator("#kt-popup")
        .evaluate((e) => e.scrollWidth <= e.clientWidth),
    );
    await mobileContext.close();
    await page.locator("#kt-add").click();
    await set("name", "Browser test");
    for (const period of ["day", "week", "month", "quarter"]) {
      await set("period", period);
      assert.ok(await page.locator("#kt-preview .sq").count());
    }
    await set("period", "day");
    await set("deadline", "next");
    assert.equal(
      await page.locator("#kt-deadline-time-wrap").isVisible(),
      true,
    );
    await set("deadlineTime", "09:15");
    await page.locator("#kt-undo").click();
    assert.equal(await page.locator("#kt-deadlineTime").inputValue(), "08:00");
    await page.locator("#kt-redo").click();
    assert.equal(await page.locator("#kt-deadlineTime").inputValue(), "09:15");
    await set("period", "month");
    await set("target", 3);
    await set("deadline", "none");
    await page.locator("#kt-preview .sq:not(:disabled)").first().click();
    assert.equal(
      await page.locator("#kt-preview .meta").textContent(),
      "1/1 - 100%",
    );
    await page.locator("#kt-cancel").click();
    assert.equal(
      await page.evaluate(() => localStorage.getItem("keplio.v1")),
      saved,
    );
    const quarter = await page.locator("#kt-quarter").textContent();
    await page.locator("#kt-previous-quarter").click();
    assert.notEqual(await page.locator("#kt-quarter").textContent(), quarter);
    await page.locator("#kt-next-quarter").click();
    await card("reading").hover();
    await card("reading")
      .locator(".month-calendar:not([hidden]) .month-next")
      .click();
    assert.equal(
      await card("reading")
        .locator(".month-calendar:not([hidden]) .month-label")
        .textContent(),
      "NOV",
    );
    await card("reading")
      .locator(".month-calendar:not([hidden]) .month-previous")
      .click();
    // Real pointer events verify dragging and Escape while the pointer is held.
    const order = await page
      .locator("#kt-panels > section")
      .evaluateAll((nodes) => nodes.map((n) => n.dataset.kpiId));
    const from = await card("reading").locator(".kpi-title").boundingBox();
    const to = await card("improvements").locator(".kpi-title").boundingBox();
    await page.mouse.move(from.x + 8, from.y + 8);
    await page.mouse.down();
    await page.mouse.move(to.x + 8, to.y + 8, { steps: 12 });
    assert.equal(await page.locator(".drag-ghost").count(), 1);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    assert.deepEqual(
      await page
        .locator("#kt-panels > section")
        .evaluateAll((nodes) => nodes.map((n) => n.dataset.kpiId)),
      order,
    );
    assert.equal(await page.locator("#kt-popup").isVisible(), false);
    assert.equal(
      await page.evaluate(() => localStorage.getItem("keplio.v1")),
      saved,
    );
    await card("reading").locator(".kpi-title").focus();
    await page.keyboard.press("Alt+ArrowDown");
    await page.waitForFunction(
      () => !document.getElementById("kpi-concept").classList.contains("busy"),
    );
    assert.deepEqual(
      await page
        .locator("#kt-panels > section")
        .evaluateAll((nodes) => nodes.slice(0, 2).map((n) => n.dataset.kpiId)),
      [order[1], order[0]],
    );
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .map((animation) => animation.finished.catch(() => {})),
      ),
    );
    for (const width of [320, 375, 800, 1200]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      const bounds = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        width: innerWidth,
      }));
      assert.ok(
        bounds.scroll <= bounds.width,
        JSON.stringify({
          ...bounds,
          overflow: await page.evaluate(() =>
            [...document.querySelectorAll("body *")]
              .filter((e) => e.getBoundingClientRect().right > innerWidth)
              .map((e) => ({
                tag: e.tagName,
                cls: String(e.className),
                right: e.getBoundingClientRect().right,
              })),
          ),
        }),
      );
      await page.locator("#kt-add").click();
      assert.ok(
        await page
          .locator("#kt-popup")
          .evaluate((e) => e.scrollWidth <= e.clientWidth),
      );
      await page.locator("#kt-cancel").click();
    }
    await page.locator("#kt-add").click();
    await set("name", "Saved test");
    await page.locator('#kt-editor button[type="submit"]').click();
    await page.locator("#kt-popup").waitFor({ state: "hidden" });
    assert.equal(
      await page.locator("#kt-panels > section").count(),
      fixture.items.length + 1,
    );
    await page.locator(".kpi-title", { hasText: "Saved test" }).click();
    await set("name", "Edited test");
    await page.locator('#kt-editor button[type="submit"]').click();
    await page.locator("#kt-popup").waitFor({ state: "hidden" });
    await page.locator(".kpi-title", { hasText: "Edited test" }).click();
    await page.locator("#kt-remove").click();
    await page.locator("#kt-delete-dialog .delete-confirm").click();
    await page.locator("#kt-popup").waitFor({ state: "hidden" });
    assert.equal(
      await page.locator("#kt-panels > section").count(),
      fixture.items.length,
    );
    // Simulate quota failure without touching the real browser's storage.
    const prior = await page.evaluate(() => localStorage.getItem("keplio.v1"));
    await page.evaluate(() => {
      Storage.prototype.setItem = () => {
        throw Error("QuotaExceededError");
      };
    });
    await page.locator("#kt-add").click();
    await set("name", "Failed save");
    await page.locator('#kt-editor button[type="submit"]').click();
    assert.match(await page.locator("#kt-status").textContent(), /Not saved/);
    assert.equal(
      await page.evaluate(() => localStorage.getItem("keplio.v1")),
      prior,
    );
    assert.deepEqual(errors, []);
    console.log(
      "BROWSER CHECKS PASSED" + (screenshotMode ? "; SCREENSHOTS UPDATED" : ""),
    );
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
