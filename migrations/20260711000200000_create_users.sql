-- Up Migration

CREATE TABLE users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  display_name VARCHAR(100) NOT NULL,
  email VARCHAR(320) NOT NULL,
  password_hash TEXT,
  role VARCHAR(20) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  activation_token_hash BYTEA,
  activation_token_expires_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  password_reset_token_hash BYTEA,
  password_reset_token_expires_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT users_role_check
    CHECK (role IN ('advisor', 'reviewer', 'admin')),

  CONSTRAINT users_email_normalized_check
    CHECK (email = LOWER(BTRIM(email))),

  CONSTRAINT users_activation_token_pair_check
    CHECK (
      (activation_token_hash IS NULL AND activation_token_expires_at IS NULL)
      OR
      (activation_token_hash IS NOT NULL AND activation_token_expires_at IS NOT NULL)
    ),

  CONSTRAINT users_password_reset_token_pair_check
    CHECK (
      (password_reset_token_hash IS NULL AND password_reset_token_expires_at IS NULL)
      OR
      (password_reset_token_hash IS NOT NULL AND password_reset_token_expires_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX users_email_unique
ON users (email);

CREATE UNIQUE INDEX users_activation_token_hash_unique
ON users (activation_token_hash)
WHERE activation_token_hash IS NOT NULL;

CREATE UNIQUE INDEX users_password_reset_token_hash_unique
ON users (password_reset_token_hash)
WHERE password_reset_token_hash IS NOT NULL;

CREATE UNIQUE INDEX one_active_admin
ON users (role)
WHERE role = 'admin' AND is_active = TRUE;

CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Down Migration

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
DROP TABLE IF EXISTS users;
