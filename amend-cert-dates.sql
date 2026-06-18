-- ═══════════════════════════════════════════════════════════════════════════
-- Bulk Certification Date Amendment
-- Sets all certified officers / inspectors to:
--   Issued:  10 March 2026
--   Expiry:  10 March 2028  (2‑year validity)
--
-- Run against your D1 database:
--   npx wrangler d1 execute asset-audit-db --file=amend-cert-dates.sql
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE users
SET certification_issued  = '2026-03-10',
    certification_expiry  = '2028-03-10'
WHERE certification_issued IS NOT NULL
   OR certification_expiry IS NOT NULL;

-- Summary: verify the update
SELECT COUNT(*) AS affected_users
FROM users
WHERE certification_issued  = '2026-03-10'
  AND certification_expiry  = '2028-03-10';
