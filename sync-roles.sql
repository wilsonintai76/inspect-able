-- ═══════════════════════════════════════════════════════════════════════════
-- Fix designation/role drift caused by UserProfile save with wrong defaults.
-- Roles must match designation. Run this against your D1 database.
-- ═══════════════════════════════════════════════════════════════════════════

-- Coordinator → must have ['Coordinator']
UPDATE users SET roles = '["Coordinator"]'
WHERE designation = 'Coordinator' AND roles != '["Coordinator"]';

-- Supervisor → must have ['Supervisor']
UPDATE users SET roles = '["Supervisor"]'
WHERE designation = 'Supervisor' AND roles != '["Supervisor"]';

-- Staff / Guest / Head Of Department / Head Of Programme → must have ['Guest']
UPDATE users SET roles = '["Guest"]'
WHERE designation IN ('Staff', 'Guest', 'Head Of Department', 'Head Of Programme')
  AND roles != '["Guest"]';

-- Developer → must have ['Admin']
UPDATE users SET roles = '["Admin"]'
WHERE designation = 'Developer' AND roles != '["Admin"]';
