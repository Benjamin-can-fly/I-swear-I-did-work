# Work Log 0.2.9 checklist

- [x] Visible deadline checkbox and spaced year/month/day/hour/minute controls.
- [x] New task: current year/month only; day and time blank, no implicit deadline.
- [x] Partial drafts, clear, edit, validation, plan switching and no-deadline save.
- [x] Today total uses event/completion dates and deduplicates synchronized records.
- [x] Usage chart: adaptive Y-axis, sparse grid, themed rounded hover/focus tooltip.
- [x] Chinese/English, light/dark, small-window layout and existing plan flows.
- [x] Desktop build and isolated native smoke test.
- [x] Safe installation, file hash verification, personal data unchanged, rollback retained.

Rollback: `rollback/before-deadline-20261017-140931/Rollback-to-0.2.8.cmd`.
Close Work Log before rolling back; current personal data is preserved.

## Verified behavior

- The deadline checkbox remains outside Options. New tasks start without a deadline. Enabling it pre-fills the current year/month only; day/hour/minute remain blank.
- Partial date drafts survive reload and language changes. Clear preserves the deadline/sync switches but clears day/time. Existing task dates remain editable. Weekday and previous/next-day controls are retained.
- Today completed = independent records dated today + tasks actually completed today. Mirrors of the same task count once; creation dates and future deadlines do not change this count.
- Usage chart has 3 sparse ticks for typical ranges (0/5/10 or 0/25/50), matching reference lines and scaled bars. Zero usage has no visible bar. Tooltips support hover and keyboard focus, inherit the theme surface, and stay inside narrow viewports.
- A task scheduled today but due tomorrow displays the correct deadline in the task list.

## Evidence

- `npm test`: 39 passing tests.
- `tests/deadline-ui.mjs`: Chromium/Edge + WebKit; partial dates, invalid dates, draft reload, editing, weekday/arrows, clear, plan switching, date-based counts, actual tick positions/bar heights, tooltip boundaries, English/dark, widths 1440/800/390.
- `tests/quiet-ui.mjs`: six pages, both engines, folded controls, attachments, sync/undo, calendar, reports, backups, themes and responsive layout.
- `tests/plans-ui.mjs`: daily/weekly/monthly plan flows, timed/count modes, release boundaries, undo and draft restoration.
- `tests/desktop-native.mjs`: isolated Windows desktop, standalone and reused backend, record/task saving, partial deadlines, appearance, PDF and shutdown.
- Rollback tested in an isolated installation; new records, tasks, attachments and plan settings remain intact.
- `artifacts/deadline/deployment.json`: 75 installed files match the tested build; personal data hash unchanged; running user window preserved.
- Screenshots and browser results: `artifacts/deadline/`.

Installer: `dist/WorkLog-0.2.9-windows-x64-setup.exe`, with matching SHA-256 file.
This version is installed locally. The source update is separate from publishing installation packages; public downloads remain on the version listed on the Releases page. macOS native packaging was not run; WebKit browser coverage is not a macOS installation test.
Native startup measurements are retained in `artifacts/native-0.2.9-*/startup.json`. The standalone run drew its first frame at 1.86 seconds and reached ready at 6.59 seconds; this is not a claim of full interaction within two seconds.
