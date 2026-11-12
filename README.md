# Loop — Keep the thread

Version 0.1.0. A personal, client-side system for commitments ("loops") and their resolution.
No backend, no account, no external services. Data lives in the browser's IndexedDB.

## Put it on GitHub Pages

1. Upload `dist/index.html` and `dist/sw.js` to the root of your repository (replace the old files).
2. Repository → Settings → Pages → Source: "Deploy from a branch", branch `main`, folder `/ (root)`.
3. Open `https://<username>.github.io/<repository>/`.

`index.html` is the whole app in one file. `sw.js` is optional: it lets the app reopen without a connection.

## Your data

- Stored only in the browser you use, on that device. GitHub never receives it. Nothing syncs.
- Settings → Download Backup saves everything as `loop-backup-YYYY-MM-DD.json`. Restore it from the same screen.
- Because storage is per site address, loops entered at one URL do not appear at another. Move them with a backup.

## Source layout

```
src/lib/dates.js     local date and time helpers
src/lib/storage.js   storage adapter (IndexedDB today; a Loop Core backend would be another adapter)
src/lib/model.js     loop data model, stages, steps, history
src/lib/logic.js     monthly pool and rewards, today's plan, calendar events, insights, recommendations
src/lib/backup.js    backup, validation, merge, CSV and JSON export
src/lib/seed.js      sample data (flagged sample: true)
src/store.jsx        application state and every write
src/ui.jsx           shared primitives (modal, menu, inputs, icons)
src/shared.jsx       loop table, loop panel, capture / close / reschedule dialogs
src/views/*.jsx      Home, Loops, Calendar, Sectors, Insights, Rewards, Settings
src/styles.css       all styling
build.mjs            bundles everything into dist/index.html
```

## Rebuild after editing

Needs Node with `esbuild`, `react` and `react-dom` installed (`npm i esbuild react react-dom`), then `node build.mjs`.

## Known limits in 0.1

- Reminders fire only while Loop is open in a tab.
- Recurrence opens the next occurrence when a repeating loop is completed; the calendar does not project future occurrences.
- Insights are descriptive counts only.
