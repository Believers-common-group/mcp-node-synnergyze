-- GEN-CON-GCHAT-001: execute only in the selected dev database after owner review.
-- Does not enable OAuth, deploy an API, or contain token data.
create schema if not exists synnergyze_oauth;

create table if not exists synnergyze_oauth.google_chat_nonce (
  nonce_digest char(64) primary key,
  actor_binding_digest char(64) not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists google_chat_nonce_expiry
  on synnergyze_oauth.google_chat_nonce (expires_at);

comment on table synnergyze_oauth.google_chat_nonce is
  'Bounded one-use, hashed OAuth transactions. No authorization codes or tokens.';

-- Periodic deletion of expired rows belongs to a separately governed job.
-- Do not grant this table to public or anonymous roles.
