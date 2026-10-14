# Changelog – SRU Voice | سجل التغييرات

Versioning: single digit after the decimal point (… 1.8 → 1.9 → 2.0).

## [1.3] – 2026-10-14
### Fixed
- Logos showed as text on the sign-in screen when the shared files at `ictsru.github.io/ITOC/assets/` could not be reached. A compact built-in copy of each logo is now used automatically whenever a shared file fails to load (sign-in card, header and footer, including logos drawn by the Brand Kit). The shared ITOC files stay the primary source.

## [1.2] – 2026-10-14
### Changed
- Header and footer now come from the shared **SRU Brand Kit** (`https://ictsru.github.io/ITOC/brand/sru-brand.js`); the sign-in card reads the same logo files from `ITOC/assets/`.
- Logos are no longer copied into this repository: the `assets/` folder was removed. A logo change in `ITOC/assets/` now updates SRU Voice automatically.
### Added
- `CONFIG.BRAND_ASSETS` and an offline fallback: if the kit cannot load, the page renders the same header/footer from the shared logo files.

## [1.1] – 2026-10-14
### Changed
- Official logos added to `assets/`: Sulaiman Alrajhi University (header – right), ICTD (header – left), ITOC (footer – bottom-left, linked to the ITOC forms hub).
- Logo sizing tuned for the header band and footer.

## [1.0] – 2026-10-14
### Added
- Front end `index.html` (Arabic RTL, SRU visual identity, Cairo font, Lucide icons, mobile-ready).
- Branded ITOC sign-in screen + Google sign-in limited to `@sr.edu.sa` / `@srcolleges.org`; sign-in log (e-mail, date, time).
- Submission of suggestions and complaints with 9 categories, public-voting opt-in, name hiding, daily limit (5).
- Public ideas board with one-vote-per-student toggle, search, filters and sorting.
- «طلباتي» 6-stage tracker with official responses and visible history.
- «أنجزنا بملاحظاتكم» (You said – We did) page with completion KPIs.
- Admin panel: stage updates, assignment from SRU org structure (`sru-departments.json`), publishing approval, response, improvement note, internal note, audit log, CSV export.
- Backend `Code.gs`: token verification, 5-sheet data model, LockService concurrency, formula-injection protection.
- Automation: acknowledgement e-mail, new-item admin alert, stage-change e-mail, daily SLA reminder.
- Demo mode (browser-only data) for review before connecting the Sheet.
