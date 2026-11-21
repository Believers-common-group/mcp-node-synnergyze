-- GEN-CON-GCHAT-001 credential store: PROPOSAL ONLY; do not apply without review.
-- Fields hold ciphertext, nonce/IV and authentication tag, never plaintext tokens.
-- Access is restricted to a dedicated Synnergyze service principal.
create schema if not exists synnergyze_oauth;

create table if not exists synnergyze_oauth.google_chat_access_token (
  binding_digest char(64) primary key,
  key_id varchar(64) not null,
  iv text not null,
  tag text not null,
  ciphertext text not null,
  scope_digest char(64) not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists google_chat_access_token_expires
  on synnergyze_oauth.google_chat_access_token(expires_at);

comment on table synnergyze_oauth.google_chat_access_token is
  'Encrypted, read-only Google Chat access tokens; bounded per DigitalMe, principal, Google account and consent.';

-- Required before rollout: use DB service-specific roles and grant minimum privileges.
-- Do not grant SELECT/INSERT/UPDATE/DELETE on this table to anonymous/public roles.
-- Schedule retention expiry cleanup separately. Rotate encryption keys by re-encryption
-- on the trusted server; do not commit key material, client secrets or token contents.
