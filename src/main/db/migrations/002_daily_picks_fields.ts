export const sql = `
-- Migration 002: Add display fields to daily_picks and cleanup orphaned rows

-- Add columns to store display fields directly so hydration doesn't rely on leetcode_problems
ALTER TABLE daily_picks ADD COLUMN title TEXT;
ALTER TABLE daily_picks ADD COLUMN url TEXT;
ALTER TABLE daily_picks ADD COLUMN difficulty TEXT;
ALTER TABLE daily_picks ADD COLUMN tags TEXT; -- JSON array string

-- Delete orphaned daily_picks rows whose slug no longer exists in leetcode_problems
DELETE FROM daily_picks
WHERE slug NOT IN (SELECT slug FROM leetcode_problems);

-- Populate newly-added columns from the current leetcode_problems cache (for remaining rows)
UPDATE daily_picks
SET title = (SELECT title FROM leetcode_problems WHERE leetcode_problems.slug = daily_picks.slug),
    url = (SELECT url FROM leetcode_problems WHERE leetcode_problems.slug = daily_picks.slug),
    difficulty = (SELECT difficulty FROM leetcode_problems WHERE leetcode_problems.slug = daily_picks.slug),
    tags = (SELECT tags FROM leetcode_problems WHERE leetcode_problems.slug = daily_picks.slug)
WHERE slug IN (SELECT slug FROM leetcode_problems);
`;
