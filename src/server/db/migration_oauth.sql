-- OAuth Accounts Table
-- Links a user to one or more OAuth provider identities.
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,                   -- e.g. 'google'
  provider_account_id TEXT NOT NULL,        -- Google's stable `sub` claim
  provider_email TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_provider
  ON accounts(provider, provider_account_id);

-- Sessions Table (optional audit trail; KV is the live authority)
-- Useful for kiosk management, security monitoring, audit logs.
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,                      -- matches KV sess:{userId}.sessionId
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,                 -- ISO 8601
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  ip_address TEXT,
  user_agent TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
