# GolfChallenge — Project Plan

> **Single Source of Truth:** This document tracks milestones, acceptance criteria, verification status, blockers, and session handoffs. Always read [GEMINI.md](./GEMINI.md) and this file at the start of every session.

## Project Status Overview
- **Current Phase:** Milestone 6 Complete — all planned milestones done
- **Completed Milestones:**
  - Milestone 0 (Planning & Architecture Docs)
  - Milestone 1 (App Foundation, Mat Settings, Visual Direction & Responsive Shell)
  - Milestone 2 (Distance Rounds Game, Session Storage, ConfigKey & Personal Bests)
  - Milestone 3 (Putting Ladder Game)
  - Milestone 4 (Pace Control Game)
  - Milestone 5 (Session History, Comparable Personal Bests & Data Export/Import)
  - Milestone 6 (Accessibility Audit, Polish & Deployment Preparation)
- **Active Blockers:** None

---

## Milestones & Acceptance Criteria

### Milestone 0: Planning & Architecture Foundation
- **Status:** COMPLETED (2026-11-12)
- **Deliverables:**
  - `GEMINI.md` — Stable project instructions, conventions, and commands.
  - `project_plan.md` — Milestone roadmap, acceptance criteria, and session handoff log.
  - `architecture.md` — Domain rules, state models, storage schema, and design tokens.

---

### Milestone 1: App Foundation, Mat Settings, Visual Direction & Responsive Shell
- **Status:** COMPLETED (2026-11-12)
- **Scope:**
  - Initialize Git repository and `.gitignore` (excluding `node_modules`, `dist`, coverage, temporary artifacts).
  - Scaffold React + TypeScript + Vite + Vitest project with minimal dependencies and committed `package-lock.json`.
  - Implement mat settings domain module (`src/domain/matSettings.ts`):
    - Fixed physical mat length of **3.0 metres** (`metres` only for v1; no defaults or options exceeding `3.0m`).
    - Configurable maximum usable putting distance (`maxUsableDistanceMetres`, `1.0m` to `3.0m` in `0.1m` steps).
    - Validation of all default/challenge distances against `maxUsableDistanceMetres` (`0.5m <= d <= maxUsableDistanceMetres <= 3.0m`).
  - Implement versioned settings storage (`src/storage/settingsStorage.ts`, `schemaVersion: 1`):
    - Save and load `MatSettings`.
    - Gracefully handle unavailable `localStorage` and invalid/corrupted saved data.
    - If unreadable saved data cannot be backed up successfully, **preserve the original value in storage and avoid overwriting it** until explicit user reset.
    - Expose clear, accurate storage status and warning messages to the UI.
  - Build the plain CSS design system (`tokens.css`, `base.css`, `components.css`) with warm off-white surfaces, deep turf-green accents, accessible contrast, `:focus-visible` outlines, and `prefers-reduced-motion` support.
  - Build the responsive app shell:
    - Header and navigation (`Practice Challenges` and `Mat Settings`).
    - Visible, accurate storage status/error banner when storage is unavailable or corrupted.
    - Challenge overview cards for **Distance Rounds**, **Putting Ladder**, and **Pace Control** that clearly indicate the games are not yet available (zero invented scores, fake history, or dead controls).
    - Interactive **Mat Settings** panel allowing the user to configure `maxUsableDistanceMetres` (up to `3.0m`) and their default putting distances (validated against `maxUsableDistanceMetres`), persisted across reloads.
- **Verification Record:**
  - `npm test` — Passed (`2` test files, `10` tests covering 3.0m physical limit, usable distance validation, non-0.1m/duplicate/unit rejection, valid persistence, unavailable storage fallback, corrupted backup, and preserving original unreadable data when backup fails).
  - `npm run typecheck` — Passed with zero errors (`tsc --noEmit`).
  - `npm run build` — Passed (`tsc -b && vite build`).
  - Browser inspection on `http://localhost:5173/` across desktop (`1280x800`) and mobile (`390x844`) viewports verified layout, honest "Not yet available" challenge badges, lowering usable distance to `2.6m` auto-pruning `3.0m`, rejecting `2.8m` (`> 2.6m`), adding `1.8m` in sorted order, persistence across reload, and resetting to `3.0m` defaults.

---

### Milestone 2: Distance Rounds Game, Session Storage, ConfigKey & Personal Bests
- **Status:** COMPLETED (2026-11-12)
- **Scope:**
  - Implement `src/domain/types.ts`, `src/domain/configKey.ts`, `src/domain/personalBests.ts`, and `src/domain/distanceRounds.ts`:
    - Setup validation ensuring all challenge distances are within `0.5m` and `maxUsableDistanceMetres` (`<= 3.0m`).
    - Fixed putts per distance (`3 | 5 | 10`) and rounds (`1 | 2 | 3`).
    - 1 point per made putt (clearly explained before starting), plus makes, attempts, and make % by distance and overall.
    - Default `Made / Missed` single-tap input, with optional non-blocking miss details (`direction: left | center | right` and `distance: short | good | long` as separate dimensions).
    - Undo, duplicate-submission protection, auto-resume on refresh, and explicit Abandon Session action.
  - Extend versioned storage to persist `activeSession` and `history` (`CompletedSessionRecord[]`), preserving existing M1 settings and all corruption/backup safeguards.
  - Build Distance Rounds setup, active session view, and session summary view with comparable Personal Best calculation (`configKey` equivalence).
- **Acceptance Criteria:**
  - **Post-Final-Putt Undo Rule:** Undo immediately after the final putt must reopen the session and update the saved result and any derived personal best correctly, without duplicate history entries.
  - Comprehensive Vitest tests for `distanceRounds`, `configKey`, `personalBests`, session recovery, and post-completion undo.
  - Browser verification of the complete Distance Rounds flow (setup, validation against usable mat distance, play, miss tagging, undo during play and after final putt, refresh auto-resume, abandon, and summary PB display).
- **Verification Record:**
  - `npm run typecheck` — Passed with zero errors (`tsc --noEmit`).
  - `npm test` — Passed (`3` test files, `17` tests covering `matSettings`, `distanceRounds`, `configKey` equivalence, `personalBests`, session recovery, and post-final-putt Undo reopening/updating history and PB without duplicates).
  - `npm run build` — Passed (`tsc -b && vite build`).
  - Browser inspection on `http://localhost:5173/` across desktop (`1280x800`) and mobile (`390x844`) viewports verified the "Available" Distance Rounds badge alongside "Not yet available" Putting Ladder & Pace Control cards, usable mat distance (`2.6m`) validation rejecting `2.8m`, setup explanation of `1 point per made putt`, single-tap Made/Missed logging with optional non-blocking miss details (`Left` + `Short`), mid-session Undo, page reload auto-resume, post-final-putt Undo reopening Putt 6 of 6 and updating the saved benchmark from `5/6` to `4/6` with `history.length === 1`, comparable Personal Best improvement (`+2 pts` on `6/6`), and Abandon Session confirmation.

---

### Milestone 3: Putting Ladder Game
- **Status:** COMPLETED (2026-11-12)
- **Scope:**
  - Implement `src/domain/puttingLadder.ts`:
    - Advance 1 distance rung on `Made`, stay at current distance rung on `Missed`.
    - Fixed attempt budget (`10 | 15 | 20 | 30`).
    - All distances validated against `maxUsableDistanceMetres` (`<= 3.0m`).
    - Clear final-distance rule: Making a putt on the final configured distance completes the ladder (`cleared: true`), scored by rungs completed and efficiency (`attemptsUsed` / `attemptsRemaining`).
    - Full support for optional miss details, Undo (including after the final putt), duplicate-completion protection, auto-resume, and Abandon Session.
  - Build Putting Ladder setup, active ladder view, and summary integration.
- **Acceptance Criteria:**
  - Vitest suite covers ladder advancement, staying on miss, clearing the final rung, budget exhaustion, post-final-putt undo reopening/updating history and PB without duplicates, and comparable PB ranking.
  - Browser verification of cleared and budget-exhausted runs on mobile and desktop layouts.
- **Verification Record:**
  - `npm run typecheck` — Passed with zero errors (`tsc --noEmit`).
  - `npm test` — Passed (`4` test files, `25` tests covering `matSettings`, `distanceRounds`, `puttingLadder` progression, staying on miss, clearing the final rung, budget exhaustion, `configKey` equivalence, `personalBests` ranking, and post-final-putt Undo reopening/updating history and PB without duplicates).
  - `npm run build` — Passed (`tsc -b && vite build`).
  - Browser inspection on `http://localhost:5173/` across desktop (`1280x800`) and mobile (`390x844`) viewports verified the "Available" Distance Rounds & Putting Ladder badges alongside "Not yet available (Milestone 4)" Pace Control, usable mat distance (`2.6m`) validation rejecting `2.8m`, minimum 2-distance validation, staying on miss with optional `Left` + `Short` tagging, advancing on make, reload auto-resume, clearing the final rung (`Ladder Cleared!`), post-final-putt Undo on both cleared and budget-exhausted runs updating history/PB without duplicates, comparable PB improvement (`2/10` beating `4/10` attempts), and Abandon Session confirmation.

---

### Milestone 4: Pace Control Game
- **Status:** COMPLETED (2026-11-12)
- **Scope:**
  - Implement `src/domain/paceControl.ts`:
    - Configurable target distances (validated `<= maxUsableDistanceMetres <= 3.0m`), physical target zone depth (`0.2m` – `0.6m`), and putts per distance.
    - Three primary inputs: `Short`, `In Zone` (1 point), `Long`.
    - Dispersion breakdown (`% Short`, `% In Zone`, `% Long`) by distance and overall.
    - Full support for Undo (including after the final putt), duplicate-completion protection, auto-resume, and Abandon Session.
  - Build Pace Control setup (with concise physical mat zone instructions), 3-button logging view, and summary integration.
- **Acceptance Criteria:**
  - Vitest suite covers pace control progression, dispersion tallies, post-final-putt undo reopening/updating history and PB, and comparable PB calculation.
  - Browser verification of full Pace Control flow on mobile and desktop layouts.
- **Verification Record:**
  - `npm run typecheck` — Passed with zero errors.
  - `npm test` — Passed (`5` test files, `40` tests; new `paceControl.test.ts` has 13 tests covering setup validation, configKey equivalence, progression, dispersion tallies, PB ranking and post-final-putt Undo; `settingsStorage.test.ts` adds persistence/auto-resume/undo-without-duplicates and invalid-zone-depth backup tests).
  - `npm run build` — Passed.
  - Browser inspection on `http://localhost:5173/` (viewport was mobile-width only; desktop layout was **not** separately inspected): all three cards show "Available"; setup rejected `3.5m`; 5-distance / 3-putt / 0.4m setup started; Short / In Zone / Long logging; mid-session Undo; reload auto-resume at the saved putt; completing showed the summary with a first-benchmark PB callout; Undo Final Putt reopened the session and removed the history record (`1 → 0`); re-completing left exactly 1 history entry with the updated score (`6/15 → 5/15`); Abandon Session cleared the active session without touching history.
- **Design notes:** The target zone is described as a zone of the chosen depth centred on each target distance (measured from the start line). Pace Control is ranked on In Zone points only. Putts run distance by distance in ascending order, single pass (no rounds).

---

### Milestone 5: Session History, Comparable Personal Bests & Data Export/Import
- **Status:** COMPLETED (2026-11-12)
- **Scope:**
  - Build the `History & Data` view:
    - Session history list filterable by game mode, with expandable per-distance breakdowns and PB indicators.
    - Comparable Personal Bests overview grouped by `configKey`.
    - Delete individual session (with confirmation and PB recalculation).
  - Implement JSON Export & Validated Import backup:
    - Clear notice that browser-local data can be cleared by the browser and Export is the backup mechanism.
    - One-tap JSON export download.
    - Validated JSON import (verifying `schemaVersion: 1`, settings bounds `<= 3.0m`, and session records in memory before touching storage) with preview and explicit user confirmation before replacing saved data.
- **Acceptance Criteria:**
  - Vitest tests for export/import validation, rejecting malformed or out-of-bounds payloads without modifying existing data.
  - Browser verification of history filtering, PB grouping, export, invalid import rejection, and confirmed replacement.
- **Verification Record:**
  - `npm run typecheck` — Passed. `npm test` — Passed (`6` test files, `58` tests; new `src/storage/dataTransfer.test.ts` has 18 tests: valid round trip of all three modes, malformed JSON, wrong `schemaVersion`, settings/default distances > 3.0m, session-config and attempt distances out of bounds, invalid zone depth, invalid/over-long attempts, duplicate session ids, storage byte-identical after rejection, confirmed replacement + reload, rollback on write failure, import blocked while unreadable data is preserved, deletion with PB promotion/removal, active session untouched, open-summary session not deletable, mode filter). `npm run build` — Passed.
  - Browser (`http://localhost:5173/`, seeded with clearly test-only data via localStorage, cleared afterwards) at `390x844` and `1280x800`: History & Data tab; filtering by mode (1 ladder / 2 distance rounds); expandable breakdown tables; PBs grouped by `configKey` with "★ Personal best" text badges; deleting the PB session after confirmation promoted the next-best and persisted (`4 → 3` records); export triggered a `golf-challenge-backup-<date>.json` download (settings + history); an out-of-bounds (`3.5m`) import and malformed JSON were rejected with storage unchanged; a valid import showed a preview, did nothing until confirmed, then replaced history and settings (usable `2.6m` shown in the header). No horizontal page overflow on mobile (Pace Control breakdown table scrolls inside its own wrapper). Not browser-tested: delete-while-active-summary (covered by unit test only), real OS file-picker dialog (file chosen programmatically).
- **Design notes:**
  - Exports are a valid `StorageEnvelopeV1` (`schemaVersion`, `settings`, `history`, plus `app`/`exportedAt`); the active session is deliberately **not** exported or replaced by import. Import requires both `settings` and a `history` array.
  - Import and load share `parseAndValidateEnvelope` (now exported from `settingsStorage.ts`); attempt distances are now bounded to `0.5m–3.0m` and duplicate `sessionId`s are rejected for load as well as import.
  - Import is refused while unreadable data is being preserved (reset first), and is rolled back if the storage write fails. A session still shown on its challenge summary cannot be deleted from history until closed.
  - Personal bests are derived on demand, so deletion recalculates them automatically.

---

### Milestone 6: Accessibility Audit, Polish & Deployment Preparation
- **Status:** COMPLETED (2026-11-12)
- **Scope:**
  - Keyboard navigation, focus management, ARIA live announcements, contrast & reduced-motion verification.
  - Clearly labeled optional Demo Data preview mode (strictly isolated from real saved history).
  - Concise `README.md` and static hosting configuration.
- **Acceptance Criteria:**
  - Full test suite, typecheck, and production build pass with zero warnings/errors.
  - Browser verification across mobile/desktop viewports and production preview (`vite preview`).
- **Verification Record:**
  - `npm run typecheck` — passed. `npm test` — 7 files, 62 tests passed (new `demoData.test.ts`: demo sessions cover all modes, deterministic, pass the real import validator, `demo_` ids; announcement text for log/complete/undo/close). `npm run build` — passed, no warnings (relative asset URLs in `dist/index.html`).
  - Browser on `vite preview` (`http://localhost:4173/`), mobile `375x812` and the pane's desktop width (~800px; a true 1280px viewport was **not** tested): tab arrow/Home/End/wrap keys move focus and selection; only the selected tab has `aria-controls` (-> existing `#main-tabpanel`); focus moves to the new view heading on setup/start/summary/undo-reopen/abandon; abandon confirm focuses "Keep Playing" and restores focus to Abandon; history delete confirm focuses "Keep", Keep restores "Delete", delete/import move focus to the status notice; invalid import focuses the error, Dismiss returns to the Import button, valid import focuses the preview; live region announced start, each putt, undo, completion, reopen and close; no horizontal overflow at 375px; demo preview showed 10 rows labelled DEMO SAMPLE, left `localStorage` untouched (null), disabled export/import/delete, and reset on leaving the tab.
  - Contrast (computed): body/secondary/muted text >= 5.2:1 on all surfaces, white on accent 11:1, warning/danger/success text >= 9.3:1. All component colours use tokens.
- **Design notes:**
  - Demo data lives only in React state (`buildDemoHistory`), is passed to the History panel in place of real history, and is never given to the storage service or export. Activity announcements are derived centrally in `App.tsx` from active-session changes (`src/domain/announcements.ts`); the per-banner `aria-live` was removed to avoid double announcements.
  - `vite.config.ts` uses `base: './'`; no router, so `dist/` can be hosted anywhere static.
- **Known issues / not verified:** `prefers-reduced-motion` verified by code review (global CSS override) only, not toggled in the browser; no real screen reader (NVDA/VoiceOver) test; true 1280px desktop and real OS file picker not exercised; the one-tab-panel-at-a-time pattern means inactive tabs have no `aria-controls`.

---

## Session Handoff Log

### Session 1 (2026-11-12) — Planning Only
- **What is finished:** Created initial `GEMINI.md`, `architecture.md`, and `project_plan.md`.
- **What was actually verified:** Directory inspection and file creation.
- **Known issues or blockers:** None.
- **Next exact task:** Revise planning docs per user refinements and implement Milestone 1.

### Session 2 (2026-11-12) — Milestone 1 Implementation
- **What is finished:**
  - Updated `GEMINI.md`, `architecture.md`, and `project_plan.md` with all 6 planning refinements.
  - Initialized Git repository, `.gitignore`, and scaffolded React 19 + TypeScript + Vite + Vitest.
  - Implemented `src/domain/matSettings.ts` and `src/storage/settingsStorage.ts` with unit tests (`src/domain/matSettings.test.ts`, `src/storage/settingsStorage.test.ts`).
  - Built plain CSS design system (`tokens.css`, `base.css`, `components.css`) and responsive shell (`AppHeader.tsx`, `StorageBanner.tsx`, `ChallengeCards.tsx`, `MatSettingsPanel.tsx`).
- **What was actually verified:**
  - Automated CLI checks: `npm run typecheck`, `npm test` (10/10 passing), and `npm run build` (clean production bundle).
  - Live browser checks on `http://localhost:5173/` across desktop (`1280x800`) and mobile (`390x844`) viewports: verified responsive layout, honest "Not yet available" challenge cards, stepper adjustment of usable mat distance to `2.6m` auto-pruning `3.0m`, validation error when attempting to add `2.8m` (`> 2.6m`), adding `1.8m` in sorted order, persistence across reload, and resetting to `3.0m` defaults.
  - Manual/untested in live browser: Simulated `QuotaExceededError` during live browser backup (verified via deterministic unit test in `src/storage/settingsStorage.test.ts`).
- **Known issues or blockers:** None.
- **Next exact task:** Implement **Milestone 2** (Distance Rounds game engine, session & history persistence, `configKey` & personal-best calculation, post-final-putt Undo reopening/updating history without duplicates, setup/play/summary UI, and browser verification).


### Session 3 (2026-11-12) — Milestone 2 Implementation
- **What is finished:**
  - Implemented `src/domain/types.ts`, `src/domain/configKey.ts`, `src/domain/personalBests.ts`, and `src/domain/distanceRounds.ts` with distance validation against `maxUsableDistanceMetres` (`0.5m <= d <= maxUsableDistanceMetres <= 3.0m`), configurable putts per distance (`3 | 5 | 10`) and rounds (`1 | 2 | 3`), 1 point per made putt, single-tap Made/Missed logging with optional non-blocking miss details (`direction` and `distance`), duplicate-submission protection, Undo (including post-final-putt reopen), and comparable Personal Best evaluation.
  - Extended `src/storage/settingsStorage.ts` to persist `activeSession` and `history` (`CompletedSessionRecord[]`) while preserving existing mat settings and all non-destructive corruption/backup safeguards.
  - Built `src/components/DistanceRoundsFlow.tsx` and updated `ChallengeCards.tsx`, `App.tsx`, and `components.css` (leaving Putting Ladder and Pace Control clearly marked as not yet available).
  - Added unit tests in `src/domain/distanceRounds.test.ts` and `src/storage/settingsStorage.test.ts`.
- **What was actually verified:**
  - Automated CLI checks: `npm run typecheck`, `npm test` (3 test files, 17/17 tests passing), and `npm run build`.
  - Live browser checks on `http://localhost:5173/` across desktop (`1280x800`) and mobile (`390x844`) viewports: verified Distance Rounds setup validation against `2.6m` usable mat limit, active logging, optional non-blocking miss details (`Left` + `Short`), mid-session Undo, reload auto-resume, post-final-putt Undo reopening Putt 6 of 6 and updating the saved benchmark from `5/6` to `4/6` without duplicate history entries (`history.length === 1`), comparable Personal Best improvement (`+2 pts` on `6/6`), and Abandon Session flow.
- **Known issues or blockers:** None.
- **Next exact task:** Implement **Milestone 3** (Putting Ladder game engine, setup/active/summary views, post-final-putt Undo reopening/updating history and PB without duplicates, unit tests, and browser verification).

### Session 4 (2026-11-12) — Milestone 3 Implementation
- **What is finished:**
  - Implemented `src/domain/puttingLadder.ts` and extended `src/domain/types.ts`, `src/domain/configKey.ts`, and `src/domain/personalBests.ts` with ladder distance validation (`>= 2` distances ordered shortest to longest within `0.5m <= d <= maxUsableDistanceMetres <= 3.0m`), fixed attempt budgets (`10 | 15 | 20 | 30`), 1-rung advancement on `Made`, staying on `Missed`, immediate ladder completion on making the final rung (`cleared: true`), comparable PB ranking (`cleared` > `rungsCompleted` > fewer `attemptsUsed` / more `attemptsRemaining`), optional miss tags, duplicate-submission protection, and post-final-putt Undo reopening/updating history and PB without duplicates.
  - Extended `src/storage/settingsStorage.ts` to validate and persist Putting Ladder active sessions and completed history records alongside Distance Rounds.
  - Built `src/components/PuttingLadderFlow.tsx` and updated `ChallengeCards.tsx`, `App.tsx`, and `components.css` (leaving Pace Control clearly marked as not yet available).
  - Added unit tests in `src/domain/puttingLadder.test.ts` and `src/storage/settingsStorage.test.ts`.
- **What was actually verified:**
  - Automated CLI checks: `npm run typecheck`, `npm test` (4 test files, 25/25 tests passing), and `npm run build`.
  - Live browser checks on `http://localhost:5173/` across desktop (`1280x800`) and mobile (`390x844`) viewports: verified Putting Ladder setup validation against `2.6m` usable mat limit and minimum 2-distance rule, staying on miss with `Left` + `Short` tags, advancing on make, reload auto-resume, clearing the final rung (`Ladder Cleared!`), post-final-putt Undo on both cleared and budget-exhausted runs without duplicate history entries, comparable PB improvement (`2/10` beating `4/10` attempts), and Abandon Session confirmation.
- **Known issues or blockers:** None.
- **Next exact task:** Implement **Milestone 4** (Pace Control game engine, physical target zone setup & 3-button Short / In Zone / Long logging view, dispersion breakdown, post-final-putt Undo reopening/updating history and PB without duplicates, unit tests, and browser verification).

### Session 5 (2026-11-12) — Milestone 4 Implementation
- **What is finished:**
  - Added `src/domain/paceControl.ts`; extended `types.ts`, `configKey.ts` (`pace_control:v1:unit=m:d=...:zone=0.3:putts=5`) and `personalBests.ts` (points ranking and delta).
  - Extended `settingsStorage.ts` to validate/persist Pace Control active sessions and history alongside the other modes.
  - Built `PaceControlFlow.tsx`, wired it into `ChallengeCards.tsx` and `App.tsx` (Pace Control now Available), added Pace Control CSS.
  - Added tests in `paceControl.test.ts` and `settingsStorage.test.ts`.
- **What was actually verified:** typecheck, `npm test` (40/40) and `npm run build` pass; live browser flow as recorded under Milestone 4 (mobile-width viewport only).
- **Known issues or blockers:** None. Nothing committed yet.
- **Next exact task:** Implement **Milestone 5** (History & Data view, per-distance breakdown, PBs grouped by `configKey`, delete session with PB recalculation, JSON export and validated import with confirmation).

### Session 6 (2026-11-12) — Milestone 5 Implementation
- **What is finished:** `historyView.ts` (filter/sort/PB grouping), `dataTransfer.ts` (export payload, in-memory import validation + preview), `SettingsStorageService.deleteCompletedSession` / `replaceWithImportedData`, `HistoryDataPanel.tsx`, third header tab "History & Data", updated footer backup text, CSS, tests.
- **What was actually verified:** typecheck, 58/58 tests, build; browser flow as recorded under Milestone 5.
- **Known issues or blockers:** None.
- **Known issues or blockers:** None.

### Session 7 (2026-11-12) — Milestone 6 Implementation
- **What is finished:** Tab keyboard support and valid `aria-controls`, focus management, central live announcements, Demo Data preview (isolated), `README.md`, relative `base`, favicon, tests.
- **What was actually verified:** typecheck, 62/62 tests, build; browser flow as recorded under Milestone 6.
- **Known issues:** see Milestone 6. Nothing committed yet.
- **Next:** No milestone remains; optional follow-ups are a real screen-reader pass and a deploy to a chosen host.
