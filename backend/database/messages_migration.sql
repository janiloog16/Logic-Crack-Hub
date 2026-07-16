CREATE TABLE IF NOT EXISTS conversations (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversation_participants (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_conversation_participant UNIQUE (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_participants_user ON conversation_participants (user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_conversation_user ON conversation_participants (conversation_id, user_id);

CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  deleted_for_everyone_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_for_everyone_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_visible_created ON messages (conversation_id, deleted_for_everyone_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_unread_lookup ON messages (conversation_id, sender_id, created_at);

CREATE TABLE IF NOT EXISTS message_deletions (
  id BIGSERIAL PRIMARY KEY,
  message_id BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_message_deletions_message_user UNIQUE (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_message_deletions_user ON message_deletions (user_id);
CREATE INDEX IF NOT EXISTS idx_message_deletions_message_user ON message_deletions (message_id, user_id);
