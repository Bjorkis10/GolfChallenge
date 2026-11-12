# GolfChallenge — Project Plan

> **Single Source of Truth:** This document tracks milestones, acceptance criteria, verification status, blockers, and session handoffs. Always read [GEMINI.md](./GEMINI.md) and this file at the start of every session.

## Project Status Overview
- **Current Phase:** Milestone 1 Complete — Ready for **Milestone 2**
- **Completed Milestones:**
  - Milestone 0 (Planning & Architecture Docs)
  - Milestone 1 (App Foundation, Mat Settings, Visual Direction & Responsive Shell)
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
- **Status:** PENDING (Next)
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

---

### Milestone 3: Putting Ladder Game
- **Status:** PENDING
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

---

### Milestone 4: Pace Control Game
- **Status:** PENDING
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

---

### Milestone 5: Session History, Comparable Personal Bests & Data Export/Import
- **Status:** PENDING
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

---

### Milestone 6: Accessibility Audit, Polish & Deployment Preparation
- **Status:** PENDING
- **Scope:**
  - Keyboard navigation, focus management, ARIA live announcements, contrast & reduced-motion verification.
  - Clearly labeled optional Demo Data preview mode (strictly isolated from real saved history).
  - Concise `README.md` and static hosting configuration.
- **Acceptance Criteria:**
  - Full test suite, typecheck, and production build pass with zero warnings/errors.
  - Browser verification across mobile/desktop viewports and production preview (`vite preview`).

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
