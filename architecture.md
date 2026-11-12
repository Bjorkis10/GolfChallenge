# Architecture & Domain Specification

## 1. Overview & Principles
GolfChallenge is a client-side, mobile-first single-page application built with React, TypeScript, Vite, and plain CSS.

Core architectural constraints:
- **Pure Domain Logic:** All settings validation, game state machines, scoring calculations, and configuration comparability rules live in `src/domain/` as pure TypeScript functions with zero React or DOM imports.
- **No Speculative Abstractions:** Build only the modules needed for the current milestone while keeping data structures clean and extensible. Each game gets its own straightforward module rather than a generic game engine.
- **Safe, Versioned Persistence:** Browser storage is isolated behind `src/storage/` with defensive parsing, non-destructive preservation on corruption, and clear status reporting.

## 2. Directory Structure

### Milestone 1 Foundation Structure
```text
src/
├── domain/
│   ├── matSettings.ts        # Physical 3.0m mat constants, usable distance & preset validation
│   └── matSettings.test.ts   # Unit tests for mat & distance validation
├── storage/
│   ├── settingsStorage.ts    # Versioned settings persistence, corruption & backup safeguards
│   └── settingsStorage.test.ts
├── components/
│   ├── AppHeader.tsx         # Brand header, navigation tabs & mat summary pill
│   ├── StorageBanner.tsx     # Visible, accurate banner for storage warnings/corruption
│   ├── ChallengeCards.tsx    # Challenge preview cards (clearly marked unavailable in M1)
│   └── MatSettingsPanel.tsx  # Configurable max usable distance (<= 3.0m) & default distances
├── styles/
│   ├── tokens.css            # Colors, spacing, typography, focus & motion tokens
│   ├── base.css              # Reset, document defaults, accessibility utilities
│   └── components.css        # Component-scoped styles
├── App.tsx                   # Top-level shell & settings state orchestration
└── main.tsx                  # Entry point
```

### Target Structure Across Milestones 2–6
```text
src/
├── domain/
│   ├── matSettings.ts        # (M1) Mat configuration & distance bounds validation
│   ├── types.ts              # (M2+) Shared session types, miss details, completion records
│   ├── configKey.ts          # (M2+) Deterministic config fingerprinting
│   ├── personalBests.ts      # (M2+) Comparable personal best lookup & recalculation
│   ├── distanceRounds.ts     # (M2) Game 1 state transitions, undo & summary
│   ├── puttingLadder.ts      # (M3) Game 2 ladder progression, budget & summary
│   └── paceControl.ts        # (M4) Game 3 short/in-zone/long tracking & summary
├── storage/
│   ├── settingsStorage.ts    # (M1) Settings persistence & non-destructive recovery
│   └── appStorage.ts         # (M2–M5) Full session/history storage & validated JSON export/import
```

## 3. Domain Model & Game Rules

### 3.1 Physical Mat, Usable Distance & Validation (`src/domain/matSettings.ts`)
- **Physical Mat Length (`PHYSICAL_MAT_LENGTH_METRES`):** Fixed at **`3.0` metres**.
- **Units:** Version 1 uses **metres (`m`) only**. No options or defaults ever exceed `3.0m`.
- **Maximum Usable Putting Distance (`maxUsableDistanceMetres`):**
  - Because the cup/hole sits inset from the end of the physical mat, the player configures their actual maximum usable putting distance up to `3.0m`.
  - Valid bounds: `1.0m <= maxUsableDistanceMetres <= 3.0m` (step `0.1m`, default `2.7m` or `3.0m`—defaulting to `2.8m` / `3.0m` with one-tap adjustment; we use `3.0m` as initial ceiling and `[1.0, 1.5, 2.0, 2.5, 3.0]` as default distances, automatically clamping/filtering or validating if the user lowers `maxUsableDistanceMetres`).
- **Challenge Distance Validation:**
  - Minimum individual putting distance: `0.5m`.
  - Every configured distance $d$ in settings or in any challenge setup must satisfy:
    $$0.5\text{m} \le d \le \text{maxUsableDistanceMetres} \le 3.0\text{m}$$
  - Distances are rounded to 1 decimal place (`0.1m` increments), deduplicated, and sorted ascending.
  - When the user reduces `maxUsableDistanceMetres` (for example from `3.0m` to `2.6m`), any default distances exceeding `2.6m` are either flagged or cleanly adjusted so the saved preset always remains valid against `maxUsableDistanceMetres`.

### 3.2 Comparable Config Keys (`configKey` — Milestone 2+)
Personal bests are strictly compared across sessions with identical rules and settings. `getConfigKey(config)` produces a canonical string:
- Distance Rounds: `distance_rounds:v1:unit=m:d=1.0,1.5,2.0,2.5:putts=5:rounds=1:pts=1`
- Putting Ladder: `putting_ladder:v1:unit=m:d=1.0,1.5,2.0,2.5:budget=15:finish=complete`
- Pace Control: `pace_control:v1:unit=m:d=1.5,2.0,2.5:zone=0.3:putts=5`

### 3.3 Optional Miss Details (Milestone 2+)
For **Distance Rounds** and **Putting Ladder**:
- **Primary Input:** Large **Made** or **Missed** buttons (single tap logs immediately and advances).
- **Optional Miss Tagging:** After logging a miss, the player may optionally attach:
  - `direction?: 'left' | 'center' | 'right'`
  - `distance?: 'short' | 'good' | 'long'`
- Direction and distance are independent dimensions: a miss can be both `short` and `left`, only one, or neither.

### 3.4 Game 1: Distance Rounds (`distance_rounds` — Milestone 2)
- **Setup Config:**
  - `distances: number[]` (1 to 6 distances, each validated `0.5m <= d <= maxUsableDistanceMetres <= 3.0m`)
  - `puttsPerDistance: number` (default `5`, options `3 | 5 | 10`)
  - `rounds: number` (default `1`, options `1 | 2 | 3`)
- **Points System (Explained Clearly Before Starting):**
  - **1 point per made putt**, shown alongside makes, attempts, and make % per distance and overall.
- **Finish & Undo Reopen Rule:**
  - Automatically transitions to `completed` when `attempts.length === totalAttempts`.
  - **Undo after final putt:** Triggering Undo immediately after the final putt reopens the session (`in_progress`), removes the last putt, and updates/removes the saved completion record in history by `sessionId` so re-completing updates the saved result and any derived personal best without creating duplicate history entries.

### 3.5 Game 2: Putting Ladder (`putting_ladder` — Milestone 3)
- **Setup Config:**
  - `distances: number[]` (ordered shortest to longest, minimum 2 distances, all `<= maxUsableDistanceMetres <= 3.0m`)
  - `attemptBudget: number` (default `15`, options `10 | 15 | 20 | 30`)
- **Progression & Final Distance Rule:**
  - Advance 1 rung on `Made`, stay at `currentRungIndex` on `Missed`.
  - Making a putt on the final configured distance immediately completes the challenge as **Ladder Cleared!** (`cleared: true`).
  - Ranked first by `cleared`, then by `rungsCompleted`, then by **fewer attempts used** (`attemptsRemaining`).

### 3.6 Game 3: Pace Control (`pace_control` — Milestone 4)
- **Setup Config:**
  - `targetDistances: number[]` (all `<= maxUsableDistanceMetres <= 3.0m`)
  - `zoneDepthMetres: number` (`0.2m` to `0.6m` physical zone marked on the mat, within the 3.0m mat)
  - `puttsPerDistance: number` (default `5`, options `3 | 5 | 10`)
- **Gameplay & Scoring:**
  - Primary inputs: **Short**, **In Zone** (1 point), **Long**.
  - Reports `% Short`, `% In Zone`, and `% Long` overall and by target distance.

## 4. Storage Schema & Data Safety (`src/storage/`)

### 4.1 Versioned Storage Envelope
Root key: `golf_challenge_app_v1`

In Milestone 1, the envelope stores `schemaVersion: 1`, `updatedAt`, and `settings: MatSettings`. In Milestone 2, `activeSession` and `history` are added cleanly to the same `schemaVersion: 1` envelope (defaulting to `null` and `[]` when loading an M1 envelope).

```ts
export interface StorageEnvelopeV1 {
  schemaVersion: 1;
  updatedAt: string; // ISO timestamp
  settings: MatSettings;
  // Added in Milestone 2:
  activeSession?: ActiveSessionState | null;
  history?: CompletedSessionRecord[];
}
```

### 4.2 Non-Destructive Handling of Unreadable/Corrupted Data
1. **Storage Unavailable (`localStorage` disabled / SecurityError / QuotaExceededError):**
   - App operates using in-memory state and displays an accurate warning banner explaining that changes cannot be saved to browser storage.
2. **Corrupted JSON or Incompatible Schema on Load:**
   - The app **never silently overwrites** `golf_challenge_app_v1`.
   - It attempts to copy the raw unreadable string to `golf_challenge_app_v1_backup_<timestamp>`.
   - **Critical Rule:** If the backup write fails (e.g., quota full or storage error), `storageService` locks out writes to `golf_challenge_app_v1` so the original unreadable value in `golf_challenge_app_v1` is **strictly preserved and never overwritten** unless the user explicitly triggers "Reset Corrupted Storage".
   - If the backup write succeeds, the app still surfaces a visible warning banner informing the user that saved data was unreadable and backed up, and lets them confirm before overwriting or resetting.

## 5. Design System & Accessibility (`src/styles/`)
- **Palette:**
  - Background primary: `#F8F6F1` (warm alabaster/parchment)
  - Surface card: `#FFFFFF` with subtle warm border `#E2DEC9`
  - Primary accent: `#1B4332` (deep putting-green)
  - Secondary accent / interactive: `#2D6A4F`
  - Warning / Storage alert: `#7C4700` on `#FFF8EB` with `#E6C280` border
  - Error / Destructive: `#8C2D19` on `#FDF2F0`
  - Text primary: `#161A18` (high contrast > 12:1)
  - Text muted: `#4A5550` (contrast > 5.5:1)
- **Touch & Ergonomics:**
  - Interactive buttons and controls meet a minimum `48px`–`56px` touch height with clear `:focus-visible` outlines (`3px solid #1B4332`, `2px` offset) and `@media (prefers-reduced-motion: reduce)` support.
