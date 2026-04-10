create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key,
  role text not null check (role in ('patient', 'provider')),
  name text not null,
  email text not null unique,
  password_hash text not null,
  pcp_email text not null default '',
  clinic_code text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_users_role on users(role);
create index if not exists idx_users_pcp_email on users(pcp_email);
create index if not exists idx_users_clinic_code on users(clinic_code);

create table if not exists sessions (
  token text primary key,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_sessions_user_id on sessions(user_id);

create table if not exists reset_tokens (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  email text not null,
  code text not null,
  token_hash text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table reset_tokens add column if not exists token_hash text;

create index if not exists idx_reset_tokens_email on reset_tokens(email);
create index if not exists idx_reset_tokens_user_id on reset_tokens(user_id);

create table if not exists recommendations (
  id uuid primary key,
  provider_id uuid not null references users(id) on delete cascade,
  patient_id uuid not null references users(id) on delete cascade,
  title text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_recommendations_provider_id on recommendations(provider_id);
create index if not exists idx_recommendations_patient_id on recommendations(patient_id);

create table if not exists messages (
  id uuid primary key,
  sender_id uuid not null references users(id) on delete cascade,
  recipient_id uuid not null references users(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_sender_id on messages(sender_id);
create index if not exists idx_messages_recipient_id on messages(recipient_id);
create index if not exists idx_messages_created_at on messages(created_at);

create table if not exists shared_charts (
  id uuid primary key,
  patient_id uuid not null references users(id) on delete cascade,
  provider_id uuid not null references users(id) on delete cascade,
  summary_count integer not null default 0,
  summary_average numeric not null default 0,
  summary_latest numeric not null default 0,
  entries jsonb not null default '[]'::jsonb,
  shared_at timestamptz not null default now()
);

create index if not exists idx_shared_charts_patient_id on shared_charts(patient_id);
create index if not exists idx_shared_charts_provider_id on shared_charts(provider_id);
create index if not exists idx_shared_charts_shared_at on shared_charts(shared_at);

create table if not exists emergency_contacts (
  id uuid primary key,
  user_id uuid not null unique references users(id) on delete cascade,
  name text not null,
  relationship text not null,
  phone text not null default '',
  email text not null default '',
  notification_method text not null default 'sms',
  updated_at timestamptz not null default now()
);

create table if not exists emergency_alerts (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  provider_id uuid references users(id) on delete set null,
  contact_id uuid references emergency_contacts(id) on delete set null,
  contact_name text not null default '',
  notification_method text not null default '',
  reason text not null,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  status text not null
);

create index if not exists idx_emergency_alerts_user_id on emergency_alerts(user_id);
create index if not exists idx_emergency_alerts_provider_id on emergency_alerts(provider_id);
create index if not exists idx_emergency_alerts_created_at on emergency_alerts(created_at);

create table if not exists wearable_integrations (
  user_id uuid primary key references users(id) on delete cascade,
  platform text not null default 'manual',
  sync_mode text not null default 'manual',
  notes text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists wearable_readings (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  source_platform text not null default 'manual',
  sync_mode text not null default 'manual',
  heart_rate numeric,
  spo2 numeric,
  systolic numeric,
  diastolic numeric,
  temperature numeric,
  responsiveness text not null default 'unknown',
  fall_detected boolean not null default false,
  captured_at timestamptz not null default now(),
  received_at timestamptz not null default now()
);

create index if not exists idx_wearable_readings_user_id on wearable_readings(user_id);
create index if not exists idx_wearable_readings_captured_at on wearable_readings(captured_at);
