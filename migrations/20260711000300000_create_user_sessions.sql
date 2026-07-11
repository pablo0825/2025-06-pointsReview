-- Up Migration

CREATE TABLE user_sessions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_token_hash BYTEA NOT NULL,
  csrf_token_hash BYTEA NOT NULL,
  user_id BIGINT NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,
  ip_address INET NOT NULL,
  user_agent TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT user_sessions_expiry_check
    CHECK (expires_at > created_at),

  CONSTRAINT user_sessions_revoked_pair_check
    CHECK (
      (revoked_at IS NULL AND revoked_reason IS NULL)
      OR
      (revoked_at IS NOT NULL AND revoked_reason IS NOT NULL)
    ),

  CONSTRAINT user_sessions_user_fk
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX user_sessions_token_hash_unique
ON user_sessions (session_token_hash);

CREATE INDEX idx_user_sessions_user_active
ON user_sessions (user_id, expires_at)
WHERE revoked_at IS NULL;

CREATE INDEX idx_user_sessions_expires_at
ON user_sessions (expires_at)
WHERE revoked_at IS NULL;

CREATE TRIGGER user_sessions_set_updated_at
BEFORE UPDATE ON user_sessions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Down Migration

DROP TRIGGER IF EXISTS user_sessions_set_updated_at ON user_sessions;
DROP TABLE IF EXISTS user_sessions;
