# Development

Keplio is a static web app. There is no server-side backend; `rules.js` owns the scoring model and `storage.js` owns persistence.

## Source layout

```text
index.html                  Entry page and editor markup
src/
  app.js                    Rendering, navigation, editing, and reordering
  rules.js                  Dates, progress, deadlines, and scoring
  storage.js                Validation, browser storage, and adapter interface
  styles.css                Theme, heatmaps, editor, and responsive layout
scripts/
  check.cjs                 Dependency-free development checks
  browser.cjs               Browser checks and screenshot generation
tests/
  rules.cjs                 Date, deadline, and score regression tests
  storage.cjs               Validation, failure, and concurrency tests
  release.cjs               Static release checks
  fixtures.cjs              Fictional browser-test and screenshot data
docs/
  screenshots/              Current interface screenshots
```

The page loads rules, storage, then the app. No compilation is necessary. Keep `index.html` at a consistent location when opening it directly, so browser storage remains accessible.

## Checks

Use Node.js 22 or newer:

```sh
node scripts/check.cjs
```

This checks runtime syntax, date and scoring behavior, legacy entry compatibility, storage validation, stale writes, and release assets. GitHub Actions runs the same command.

Optional browser checks use Playwright in an isolated browser profile with fictional data:

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
node scripts/browser.cjs
node scripts/browser.cjs --screenshots
```

The screenshot command captures the actual app at a fixed example date. It updates the overview, editor, and mobile PNGs under `docs/screenshots/`. The test server binds only to localhost and stops when the checks finish. These tools do not access your normal browser profile.

## Scoring model

Each period has a completion count and an integer target. `status()` decides whether the period is future, pending, optional, partial, done, or missed. `score()` caps credit at the target. Open periods contribute only recorded credit to the denominator; missed periods contribute their full target. Zero recorded and zero due renders as `0/0 - 0%`.

Calendar timestamps represent wall-clock dates as UTC values for arithmetic. `now()` converts the actual time into the configured `TIME_ZONE` before comparisons. The default is `America/Boise`. Do not mix those wall-clock timestamps with raw local timestamps in scoring code.

Stored documents use schema version 1. Each tracker has `id`, `name`, `period`, `layout`, `target`, `schedule`, `deadline`, optional `deadlineTime`, `description`, and `marks`. Dates use `YYYY-MM-DD/slot` keys. The model still reads older slot-based data; editing a period consolidates only that period. Keep the compatibility code when changing the UI.

## Custom storage

Define `window.KeplioStorage` before `src/storage.js` loads:

```js
window.KeplioStorage = {
  async load() {
    return { version: 1, items: [] }; // Replace with your persisted document.
  },
  async save(document) {
    await yourStore.write(document);
  },
};
```

`load()` and `save(document)` may be synchronous or asynchronous. The wrapper validates documents and passes copies. Throw if a write fails; the UI will restore its previous state. Host adapters are responsible for concurrency and atomic writes.

The default adapter stores under `keplio.v1`, rejects stale writes, and uses Web Locks when available. Without Web Locks, concurrent-write protection is best effort. It does not provide cloud sync, authentication, or a remote database.

## Embedding

Serve the folder as static files, embed `index.html` in an iframe, or adapt its markup. For direct markup embedding, preserve the `#kpi-concept` root and adjust the `body` style to fit the host. Keep the script loading order and storage-adapter initialization intact.
