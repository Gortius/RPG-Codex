# RPG Codex — Stabilization Notes

This revision focuses on removing conflicting implementations, preventing transient UI elements during startup, and protecting local data during imports, saves, and trash operations.

## Main changes

- Kept the Overview/Records navigation in the header and aligned it to the left. The navigation copy in the sidebar no longer duplicates the original element IDs.
- Prevented the project controls and Quick Menu from appearing in their temporary positions during startup.
- Removed the obsolete project/trash handlers from `js/app.js`; project and trash management now use the enhanced implementation in `js/features/enhancements.js`.
- Shared starter records from `js/data/default-records.js` instead of maintaining separate copies.
- Removed `js/features/dashboard.js` and `js/features/click-feedback.js`, which were not imported by the active startup path.
- Consolidated record list sorting and Custom Grid styling in `css/main.css` rather than injecting a second set of view styles from `record-list.js`.
- Avoided duplicate icon-picker rendering/listeners and made the Game Icons observer process only newly added subtrees.
- Cleaned up Escape-key listeners when modal dialogs close or are replaced.
- Kept saved sort direction when storing/applying saved filters and normalized legacy sort values.
- Added stricter validation for malformed record lists, catalog entries, saved filters, trash entries, and imported backups.
- Fixed import merge handling so newly generated IDs also update the imported records' internal relations. Multi-key import writes attempt rollback on failure.
- Reworked record deletion and trash restoration to keep a recovery copy and attempt rollback when a write fails.
- Made record/catalog saves coordinated: if catalog persistence fails after a record write, the record write is rolled back where browser storage permits.
- Preserved complete data files and existing features; no GitHub repository was modified by this task.

## Files changed

- `css/main.css`
- `js/app.js`
- `js/data/default-records.js` (new)
- `js/data/storage.js`
- `js/features/catalogs.js`
- `js/features/enhancements.js`
- `js/features/filtering.js`
- `js/features/icon-library.js`
- `js/features/quick-menu.js`
- `js/features/record-list.js`
- `js/features/records.js`
- `js/features/sidebar.js`

## Files removed

- `js/features/dashboard.js` — obsolete dashboard implementation not referenced by the active app.
- `js/features/click-feedback.js` — click animation feature was not initialized by the active app.

## Validation performed

- JavaScript syntax checks (`node --check`) passed for all JavaScript files.
- Relative module import and local asset reference checks passed.
- Duplicate HTML ID check passed.
- CSS parser check passed.
- Data tests passed for sorting/filter guards, import conflict remapping, relation preservation, multi-key rollback, malformed backups, legacy saved-filter normalization, corrupt trash preservation, and record-deletion rollback.
- A browser-based visual smoke test could not be completed because the available browser runtime blocked navigation to the local test page. Header alignment and startup flicker therefore still need a quick manual confirmation in the user's browser.
