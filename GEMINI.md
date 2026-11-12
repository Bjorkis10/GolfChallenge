# GolfChallenge — Project Instructions

## Purpose
Mobile-first home putting practice web application designed for a **3.0m indoor putting mat**. Provides three fast-logging practice games (**Distance Rounds**, **Putting Ladder**, **Pace Control**), local session history, comparable personal bests, and JSON export/import backup.

> **Important Note on Scope & Claims:** App scores are practice aids for tracking personal consistency on a home mat—never present them as validated measures of on-course golfing ability or handicap.

## Canonical Planning & Architecture Docs
- [project_plan.md](./project_plan.md) — Single source of truth for milestone definitions, acceptance criteria, current status, verification records, and session handoff.
- [architecture.md](./architecture.md) — Module boundaries, domain models, game rules, storage schema, and technical decisions.

**Session Startup Rule:** Even though Antigravity discovers root `GEMINI.md` files automatically as workspace rules, **always explicitly read `GEMINI.md` and `project_plan.md` at the start of every session** before making changes. Treat actual code and verified test/build output as authoritative.

## Tech Stack & Dependencies
- **Framework:** React 19 + TypeScript + Vite
- **Styling:** Plain CSS with CSS custom properties (no CSS-in-JS, no Tailwind, no heavy component libraries)
- **State & Persistence:** Pure TypeScript domain modules + versioned `localStorage` wrapper
- **Testing:** Vitest (unit/integration tests for settings validation, game engines, scoring, comparability, and storage)
- **Constraint:** Keep dependencies minimal. Commit `package-lock.json`. Do not add state libraries, routing libraries, or UI kits without an explicit need.

## Key Conventions
1. **3.0m Physical Mat & Metres-Only (v1):**
   - Physical mat length is fixed at **3.0m**, and version 1 uses **metres (`m`) only**.
   - Maximum usable putting distance (`maxUsableDistanceMetres`) is configurable up to **3.0m** (e.g., `1.0m` to `3.0m` in `0.1m` steps) to account for hole placement on the mat.
   - All default and challenge distances must be validated against `maxUsableDistanceMetres` (`0.5m <= distance <= maxUsableDistanceMetres <= 3.0m`). Never include defaults or options exceeding 3.0 metres.
2. **Domain Separation:** Game rules, settings validation, state transitions, scoring, and personal-best comparability live in pure TypeScript modules under `src/domain/`, completely decoupled from React components and browser APIs.
3. **Fast, Forgiving Logging:**
   - Default input for Distance Rounds and Putting Ladder is a large binary **Made / Missed** tap.
   - Optional miss details (Direction: `left | center | right`, Distance: `short | good | long` as independent dimensions) must never require extra taps on every putt.
   - Every active game supports **Undo** of the most recent input (including undoing immediately after the final putt to reopen the session and update the saved result and any derived personal best without duplicate history entries), **duplicate-submission protection** on completion, **auto-resume** on page refresh, and an explicit **Abandon Session** action.
4. **Comparable Personal Bests:** Personal bests are only compared across sessions with an identical `configKey` (canonical fingerprint of game mode, distances, and rule parameters).
5. **Safe Local Storage:**
   - All persisted data is versioned (`schemaVersion: 1`).
   - Handle missing/disabled `localStorage`, corrupted JSON, and schema mismatches gracefully without crashing or silently wiping existing data.
   - If unreadable saved data cannot be backed up to a separate key, **preserve the original value in storage and avoid overwriting it** until the user explicitly chooses to reset. Explain storage failures visibly and accurately.
   - Data imports must be validated in memory first and require explicit user confirmation before replacing saved history.
   - Clearly inform users that browser-local data can be cleared by the browser and provide JSON export as the primary backup mechanism.
6. **Honest UI & Visual Standards:**
   - Calm sports aesthetic: warm off-white surfaces (`#F8F6F1`), deep turf-green accents (`#1B4332`), high-contrast typography, generous touch targets (minimum `56px` height for primary logging buttons).
   - Visible `:focus-visible` outlines, full keyboard operability, no information conveyed by color alone, and `prefers-reduced-motion` support.
   - Unimplemented games/features must clearly state they are not yet available—never display invented scores, fake history, or working-looking controls that do nothing.
   - Any sample/demo data used during later development must be clearly labeled and isolated from real user history.

## Milestone Workflow
For every milestone:
1. Read `GEMINI.md`, the relevant section of `project_plan.md`, and `architecture.md`.
2. State the intended changes briefly.
3. Implement **only** the authorized milestone. Do not advance to the next milestone automatically.
4. Run verification commands (`npm test`, `npm run typecheck`, `npm run build`) and inspect the live UI in the browser when UI changes are involved.
5. Review `git diff` / `git status` for unintended edits or unnecessary complexity.
6. Update `project_plan.md` with completion status, verification evidence, and the exact prompt for the next session.
7. If Git is initialized, create a focused local commit staging only relevant files (never push without instruction).

## Verified Commands
- `npm test` — Run Vitest suite once (`vitest run`)
- `npm run typecheck` — Run TypeScript compiler check (`tsc --noEmit`)
- `npm run build` — Run production bundle build (`vite build`)
- `npm run dev` — Start local Vite development server
