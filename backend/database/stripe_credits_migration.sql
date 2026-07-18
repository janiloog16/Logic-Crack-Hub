CREATE TABLE IF NOT EXISTS credit_purchases (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_session_id VARCHAR(255) NULL UNIQUE,
  package_id VARCHAR(80) NOT NULL,
  credits INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'usd',
  status VARCHAR(40) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_credit_purchases_user_created ON credit_purchases (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_credit_purchases_status ON credit_purchases (status);
