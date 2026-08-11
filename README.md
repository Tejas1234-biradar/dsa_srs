# DSA SRS — Spaced Repetition for Programming Problems

An Anki-like desktop app (Windows + Linux) for retaining DSA problem-solving techniques using FSRS spaced repetition. The app auto-selects new problems daily from a cached LeetCode dataset, so you never have to think about what to practice.

## The daily flow

1. Open the app → **Today** screen loads automatically
2. **New picks** (2/day by default): problems the app selected for you from LeetCode. Go solve them, come back, mark Solved / Struggled / Skipped.
3. **Due reviews**: problems you've solved before, ranked by lowest retrievability (most likely forgotten first). Rate recall with Again / Hard / Good / Easy.
4. Once all items are marked, you're done. Close the app.

That's the entire session.

## Setup

### Prerequisites

- Node.js ≥ 18
- npm ≥ 9

### Install

```bash
npm install
```

> `better-sqlite3` requires a native build. On Linux you may need `build-essential`. On Windows, ensure you have Visual C++ build tools.

### Development

```bash
npm run dev
```

Opens the Electron app in development mode with hot reload.

### Verify FSRS wrapper

Before building, verify the scheduling logic is correct:

```bash
npm run test:fsrs
```

This runs a standalone script that checks:
- First interval ≥ `MIN_FIRST_INTERVAL_DAYS` (clamp is working)
- Subsequent intervals are FSRS-driven (no clamp after rep 1)
- Intervals grow across successive Good reviews
- Again grades increment lapses (leech detection)
- Retrievability calculation is accurate

### Build (production)

```bash
npm run build
```

Produces installers in `release/`:
- **Windows**: `release/DSA SRS Setup.exe` (NSIS installer)
- **Linux**: `release/DSA SRS.AppImage`, `release/dsa-srs.deb`

## Architecture

```
src/
├── main/               # Electron main process (Node.js)
│   ├── index.ts        # App entry, BrowserWindow, IPC registration
│   ├── preload.ts      # contextBridge: exposes api.invoke to renderer
│   ├── db/
│   │   ├── database.ts # DB init, migrations, WAL mode
│   │   ├── schema.ts   # Typed query wrappers for all tables
│   │   └── migrations/ # SQL migration files
│   ├── fsrs/
│   │   └── wrapper.ts  # ts-fsrs wrapper with min-first-interval clamp
│   ├── leetcode/
│   │   └── fetcher.ts  # LeetCode GraphQL → SQLite cache
│   ├── scheduler/
│   │   └── dailySelector.ts  # Weighted pattern rotation algorithm
│   └── ipc/            # IPC handlers (settings, problems, reviews, today, leetcode)
├── renderer/           # React app (Vite)
│   ├── screens/        # Today, AddProblem, Browse, Settings
│   ├── components/     # Layout, shared UI
│   ├── ipc.ts          # Typed renderer-side IPC bridge
│   └── index.css       # Global design system CSS
└── shared/
    └── types.ts        # Types shared between main and renderer
```

## FSRS Wrapping — How It Deviates from Textbook FSRS

Standard FSRS (as used in Anki) goes through same-day "learning steps" before a card enters spaced review. This app skips all of that:

1. **No same-day learning steps.** The moment a problem is marked as Solved or Struggled, that *is* Review #1. FSRS kicks in immediately.

2. **Min-first-interval clamp.** FSRS's default stability parameters are tuned on flashcard data and often suggest a next-review in 1–3 days for a fresh card, which is too soon for pattern recognition (risks testing short-term solution memory, not genuine pattern retention). The wrapper clamps the first interval:

   ```
   nextInterval = fsrsResult.interval
   if (card.reps === 0) {
     nextInterval = Math.max(nextInterval, MIN_FIRST_INTERVAL_DAYS)
   }
   ```

   `MIN_FIRST_INTERVAL_DAYS` defaults to **5 days** and is user-configurable in Settings.

3. **After the first review, FSRS drives everything.** No more clamping — trust the scheduler.

4. **Desired retention: 0.85** (not Anki's default 0.90). Lower = fewer, more spaced reviews; a bit of productive struggle before recall is fine for pattern recognition.

## Data Model

| Table | Purpose |
|---|---|
| `problems` | One row per problem (title, url, tags, difficulty, leech flag) |
| `fsrs_state` | FSRS scheduling state (stability, difficulty, reps, due date) |
| `review_log` | Every review event logged (grade, interval, retrievability) |
| `leetcode_problems` | Local cache of LeetCode problem list |
| `daily_picks` | Tracks which problems were auto-surfaced each day |
| `settings` | Key/value config store |

## Configuration (Settings screen)

| Setting | Default | Description |
|---|---|---|
| Desired Retention | 85% | FSRS target recall probability |
| Min First Interval | 5 days | Earliest a new card can come back |
| New Problems/Day | 2 | Daily auto-selected new problems |
| Daily Review Cap | 30 | Max due reviews shown per day |
| Pattern Rotation | 14 patterns | DSA patterns to rotate through |
| Difficulty Band | Easy 15% / Medium 70% / Hard 15% | New problem difficulty weights |
