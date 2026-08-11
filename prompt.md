# Build Prompt: DSA Problem Retention App (FSRS-based, Anki-like desktop app)

## Agent working practices (how to build this, not just what to build)

- **Initialize a git repo at the start**, before writing any code. Commit early and
  often — small, working, logically-scoped commits, not one giant commit at the end.
  Suggested commit granularity: repo scaffold → SQLite schema + migrations → FSRS
  wrapper + scheduling logic (with the min-first-interval clamp) → LeetCode cache
  fetch/autocomplete → daily selection algorithm → Today screen → Add Problem screen
  → Browse screen → Settings screen → electron-builder packaging for win/linux.
  Each commit should leave the app in a working (even if incomplete-feature) state —
  don't commit broken intermediate states.
- Write a clear commit message per commit (what changed and why), not generic
  "wip"/"update" messages — these should read as a changelog of the build.
- **Use a plan-first approach**: before writing code, lay out the build order (roughly
  the commit sequence above) and confirm the FSRS wrapping logic and data model match
  this spec before implementing screens on top of them — the scheduling logic is the
  part most likely to need correcting, and it's cheapest to fix before UI is built on it.
- **Use subagents/parallel work where the tool supports it** for independent pieces
  that don't depend on each other's output — e.g. the LeetCode GraphQL fetch wrapper,
  the SQLite schema/migrations, and the Electron shell scaffold can reasonably be
  built in parallel before they're wired together. Don't parallelize the scheduling
  logic itself (FSRS wrapper) — that should be built and verified single-threaded
  since everything else depends on it being correct.
- **Test the FSRS wrapper in isolation** before wiring it into the UI — write a quick
  script/test that feeds it a sequence of grades and confirms: (a) the first interval
  respects `MIN_FIRST_INTERVAL_DAYS`, (b) later intervals are driven by FSRS directly
  with no clamp, (c) intervals behave sanely at the configured desired retention.
  This is the one piece of custom logic in the whole app that isn't just CRUD/UI, so
  it deserves its own verification before anything is built on top of it.
- Keep a `README.md` from the first commit onward, updated as features land, not
  written retroactively at the end.

## Context
Build a cross-platform desktop app (Windows + Linux only — no macOS, no mobile) that
works like Anki but for tracking programming/DSA problems instead of flashcards. The
goal is NOT flashcard-style atomic recall. The goal is: never lose techniques already
learned, and never have to think about what to practice.

**The daily flow, and it must be exactly this simple:**
1. User opens the app.
2. App shows today's problems — a mix of (a) due reviews from problems solved before,
   picked by FSRS, and (b) new problems for today, auto-selected by the app itself
   from a cached LeetCode problem set (default 2/day, configurable). The user does
   NOT type in a title or fill out a form to get today's list — the app decides.
3. User solves them (outside the app, on LeetCode/wherever they normally code) and
   comes back to mark the result for each.
4. User closes the app. That's the whole session.

Manually adding a problem (e.g. something solved on a whim, outside today's queue, on
a different judge) is a secondary/optional screen, not the main interaction.

## Stack (chosen for fastest cross-platform Win/Linux build, no strong stack preference from user)
- **Electron** + **React** + **TypeScript** for the app shell/UI (mature packaging story
  via `electron-builder`, trivial to target `win` and `linux` only, skip `mac`).
- **SQLite** (via `better-sqlite3`) for local storage — single file, no server, no auth.
- **`ts-fsrs`** npm package for the FSRS scheduling math — do not hand-roll FSRS.
- No cloud sync, no accounts, no mobile target for v1.

## Core scheduling design (read carefully — do not default to vanilla Anki behavior)

1. **No same-day learning steps.** Standard Anki graduates new cards through same-day
   minute-spaced reps before FSRS scheduling kicks in. Skip this entirely. The moment a
   problem is logged as solved, that IS review #1 for that card.

2. **Clamp the first interval.** FSRS's default initial-stability parameters are tuned
   on flashcard data and will often suggest a next-review in 1-3 days for a fresh card,
   which is too soon here (risks testing short-term solution memory, not pattern
   retention). Wrap the FSRS call:
   ```
   nextInterval = fsrsResult.interval
   if (card.reviewCount === 0) {
     nextInterval = Math.max(nextInterval, MIN_FIRST_INTERVAL_DAYS)
   }
   ```
   Make `MIN_FIRST_INTERVAL_DAYS` a configurable setting, default **5 days**. After the
   first successful review, trust FSRS fully — no more clamping.

3. **Desired retention default: 0.85**, not Anki's usual 0.90. Expose as a settings
   slider (range 0.75–0.95). Lower retention target = fewer, more meaningful reviews;
   a bit of productive struggle before recall is fine here, this isn't rote fact recall.

4. **Grading: standard 4-button FSRS grades (Again / Hard / Good / Easy)** shown after
   a review, same UX as Anki. Keep grading manual and simple for v1 — do NOT build
   automatic grade inference from timers/hint-counts, that's a v2 feature at most.

5. **Leech handling:** if a card has 4+ "Again" ratings within its lifetime, flag it
   (`is_leech = true`) and surface it separately in the UI as "needs re-learning," not
   just another due card. Don't auto-suspend, just flag prominently.

6. **Daily queue composition:** "Today" view = due reviews (sorted by lowest
   retrievability first, i.e. most likely forgotten first) + a target of **2 new
   problems/day** (configurable), where the new problems are picked automatically by
   the app (see "Daily problem selection" section below) — the user never types a
   title to get a new problem into today's queue. Apply a soft daily review cap
   (configurable, default 30) — if exceeded, show the cap-worth of lowest-retrievability
   cards and defer the rest, don't dump everything at once.

## Data model (SQLite)

```sql
CREATE TABLE problems (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT,
  source TEXT,                -- e.g. "LeetCode", "Codeforces"
  pattern_tags TEXT NOT NULL, -- comma-separated or JSON array: graphs, dp, sliding_window, etc.
  recognition_cue TEXT,       -- the "what tipped you off" note, not the solution
  difficulty TEXT,            -- Easy/Medium/Hard, user-set
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_leech BOOLEAN DEFAULT 0
);

CREATE TABLE fsrs_state (
  problem_id INTEGER PRIMARY KEY REFERENCES problems(id),
  stability REAL,
  difficulty REAL,
  reps INTEGER DEFAULT 0,
  lapses INTEGER DEFAULT 0,
  state TEXT,                 -- New / Learning / Review / Relearning
  due_at DATETIME,
  last_review_at DATETIME
);

CREATE TABLE review_log (
  id INTEGER PRIMARY KEY,
  problem_id INTEGER REFERENCES problems(id),
  reviewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  grade INTEGER,              -- 1=Again 2=Hard 3=Good 4=Easy
  interval_days REAL,
  retrievability_at_review REAL
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT
  -- desired_retention, min_first_interval_days, new_cards_per_day, daily_review_cap
);
```

## LeetCode autocomplete (no login required)

When the user is on the "Add Problem" screen, title entry should autocomplete against
LeetCode's problem set so they don't hand-type metadata for every single log.

- Use LeetCode's public GraphQL endpoint (`https://leetcode.com/graphql`) — no
  authentication needed for problem metadata, only for user-specific data (which is
  out of scope here). This is the same endpoint community tools like `leetcode-query`
  and various "alfa-leetcode-api" style wrappers already use — implement a thin
  fetch wrapper directly rather than pulling in a heavy dependency.
- On app startup (or on a manual "refresh" button), fetch and cache the full problem
  list locally in SQLite (`leetcode_problems` table below) — title, slug, difficulty,
  official tags, and the problem URL. Refresh this cache at most once a day; don't
  hit LeetCode's API on every keystroke.
- As the user types a title in "Add Problem," do a local fuzzy-match search against
  the cached table (e.g. simple `LIKE` query or a small fuzzy-match lib) and show a
  dropdown of matches.
- Selecting a match auto-fills: title, URL, difficulty, and LeetCode's official tags
  (pre-populate `pattern_tags` with these, but let the user freely edit/add/remove —
  LeetCode's tags are a reasonable starting point, not a replacement for the user's
  own pattern taxonomy).
- If the user types a title with no match (custom problem, different judge, etc.),
  just let them log it manually as before — autocomplete is a convenience layer, not
  a requirement to log a problem.
- Handle the network being unavailable or LeetCode's endpoint failing gracefully —
  fall back to manual entry, don't block the "Add Problem" flow on it.

```sql
CREATE TABLE leetcode_problems (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  difficulty TEXT,
  tags TEXT,          -- JSON array of LeetCode's official topic tags
  url TEXT,
  cached_at DATETIME
);
```

## Daily problem selection (automatic — this replaces manual "Add Problem" as the main flow)

Each day, the app must pick `new_cards_per_day` (default 2) problems from the cached
`leetcode_problems` table without the user typing anything. Selection logic for v1:

1. Maintain a fixed pattern rotation list (graphs, DP, sliding window, monotonic stack,
   bit manipulation, DSU/union-find, greedy, binary search, two pointers, etc. — make
   this list configurable in settings, seed it with common DSA pattern categories).
2. Track, per pattern, how many problems the user has already solved through the app
   and how many are currently leeches/struggling. Weight pattern selection toward:
   - patterns with the fewest solved problems so far (coverage gap), and
   - patterns currently flagged as leeches (reinforcement need) — but as *new* problems
     in that pattern, not repeats of the same problem (reviews handle repeats).
3. Within a chosen pattern, pick an unsolved (not already in the `problems` table)
   LeetCode problem matching the user's current difficulty band. Default difficulty
   progression: mostly Medium, occasional Easy/Hard, configurable in settings.
4. Exclude anything already present in `problems` (already logged/solved) or already
   shown as a pick in the last N days (avoid repeating an unsolved suggestion forever
   if the user skipped it — resurface it after a cooldown instead).
5. This is intentionally simple heuristic selection for v1, not adaptive ML — a
   weighted-random pick among candidates satisfying the above filters is enough.

When a new pick appears in Today's queue, it shows title, difficulty, and pattern tag
(pulled straight from the LeetCode cache) — no other setup needed before the user goes
and solves it.

## Screens (v1 scope only)

1. **Today (primary screen, opens by default)** — this is the entire daily loop:
   - **New picks** (auto-selected, see selection algorithm above): shown as a simple
     card — title, LeetCode link (opens in browser), difficulty, pattern tag. User
     goes and solves it elsewhere, comes back, marks: **Solved** / **Struggled
     (needed hints/solution)** / **Skipped today**. On Solved or Struggled, prompt
     for an optional one-line recognition cue ("what tipped you off to the
     approach") — skippable, never blocks marking the result and moving on. This
     result seeds the card's first FSRS review (Solved→Good, Struggled→Hard,
     Skipped→don't create the card yet, resurface it as a pick again later).
   - **Due reviews**: shown as a card — title + recognition cue + pattern tag (no
     solution shown). User recalls mentally whether they'd still spot the pattern,
     optionally re-attempts, then rates with the standard 4 buttons
     (Again/Hard/Good/Easy), which drives the next FSRS interval.
   - Once all of today's picks and due reviews are marked, show a simple "done for
     today" state. No further action needed — this is where the session ends.
2. **Add Problem (secondary, not part of the daily loop)** — manual-entry escape
   hatch for logging something solved outside today's auto-picks (a contest problem,
   something solved on impulse, a different judge entirely). Title autocompletes
   against the cached LeetCode list (auto-filling URL/difficulty/tags), pattern tags
   editable, optional recognition cue. Accessible from a nav item, never required to
   open on a normal day.
3. **Browse** — searchable/filterable table of all problems, filter by tag, leech
   status, due date. Basic only, no fancy heatmap required for v1.
4. **Settings** — desired retention slider, min first interval, new cards/day,
   daily review cap, pattern rotation list, difficulty progression.

## Explicitly out of scope for v1 (do not build)
- Automatic grade inference from solve time / hint usage
- Separate "concept card" vs "re-solve problem" dual-loop system
- Cloud sync / multi-device / accounts
- LeetCode login/session-based auto-import of solved problems — autocomplete only
  for v1, this is a clean seam to add later without reworking the data model
- macOS or mobile builds — target `win` and `linux` only in `electron-builder` config
- FSRS parameter re-optimization (needs 400+ reviews) — ship with FSRS default weights,
  only `desired_retention` and the first-interval floor are user-tunable in v1

## Deliverable
A runnable Electron app (`npm run dev` for dev, `npm run build` produces Windows + Linux
installers via electron-builder) implementing the above. Include a README with setup
steps and a short note on how the FSRS wrapping logic (min-first-interval clamp) works,
since that's the one place this deviates from textbook FSRS usage.