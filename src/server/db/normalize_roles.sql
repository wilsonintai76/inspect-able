-- ─── Role Normalization Migration ───────────────────────────────────────────
-- Run this ONCE against the D1 database to normalize multi-role users
-- to a single highest role per the hierarchical model:
--
--   Admin > Coordinator > Supervisor > Staff
--
-- The PBAC engine already derives all lower-role capabilities from the
-- highest role, so no user loses access.
--
-- HOW TO RUN:  npx wrangler d1 execute inspect-able-db --file=normalize_roles.sql
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE users
SET roles = (
  CASE
    WHEN roles LIKE '%"Admin"%'        THEN '["Admin"]'
    WHEN roles LIKE '%"Coordinator"%' THEN '["Coordinator"]'
    WHEN roles LIKE '%"Supervisor"%'  THEN '["Supervisor"]'
    WHEN roles LIKE '%"Staff"%'       THEN '["Staff"]'
    WHEN roles LIKE '%"Auditor"%'     THEN '["Staff"]'
    ELSE '["Staff"]'
  END
)
WHERE roles IS NOT NULL;
