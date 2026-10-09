-- Bloom It MVP persistence.
-- Apply this migration in the Supabase SQL editor before configuring Cloudflare secrets.
-- The browser never receives the service-role key and has no direct table access.

create extension if not exists pgcrypto;

create table if not exists public.learner_profiles (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(full_name) between 1 and 100),
  email text not null check (char_length(email) between 3 and 254),
  country text not null check (char_length(country) between 1 and 100),
  learner_type text not null check (char_length(learner_type) between 1 and 60),
  explanation_language text not null default 'English' check (char_length(explanation_language) between 1 and 100),
  created_at timestamptz not null default now()
);

create table if not exists public.intake_submissions (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.learner_profiles(id) on delete cascade,
  answers jsonb not null check (jsonb_typeof(answers) = 'object'),
  consent_at timestamptz not null,
  marketing_consent boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.learning_plans (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.learner_profiles(id) on delete cascade,
  intake_id uuid not null references public.intake_submissions(id) on delete cascade,
  client_request_id text not null unique check (char_length(client_request_id) between 16 and 80),
  access_token_hash text not null unique check (char_length(access_token_hash) = 64),
  plan jsonb not null check (jsonb_typeof(plan) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.learning_plans(id) on delete cascade,
  lesson_id text not null check (lesson_id ~ '^[a-z0-9-]+$'),
  completed_at timestamptz not null default now(),
  unique (plan_id, lesson_id)
);

alter table public.learner_profiles enable row level security;
alter table public.intake_submissions enable row level security;
alter table public.learning_plans enable row level security;
alter table public.lesson_progress enable row level security;

-- Explicitly deny the browser roles. Pages Functions use the service role on the server.
revoke all on table public.learner_profiles from anon, authenticated;
revoke all on table public.intake_submissions from anon, authenticated;
revoke all on table public.learning_plans from anon, authenticated;
revoke all on table public.lesson_progress from anon, authenticated;

create or replace function public.create_learning_submission(
  p_request_id text,
  p_access_token_hash text,
  p_profile jsonb,
  p_intake jsonb,
  p_plan jsonb,
  p_consent_at timestamptz,
  p_marketing_consent boolean
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_learner_id uuid;
  v_intake_id uuid;
  v_plan_id uuid;
begin
  if exists (select 1 from public.learning_plans where client_request_id = p_request_id) then
    raise exception 'duplicate_request_id' using errcode = 'P0001';
  end if;

  insert into public.learner_profiles (full_name, email, country, learner_type, explanation_language)
  values (
    p_profile->>'full_name',
    p_profile->>'email',
    p_profile->>'country',
    p_profile->>'learner_type',
    coalesce(p_profile->>'explanation_language', 'English')
  ) returning id into v_learner_id;

  insert into public.intake_submissions (learner_id, answers, consent_at, marketing_consent)
  values (v_learner_id, p_intake, p_consent_at, coalesce(p_marketing_consent, false))
  returning id into v_intake_id;

  insert into public.learning_plans (learner_id, intake_id, client_request_id, access_token_hash, plan)
  values (v_learner_id, v_intake_id, p_request_id, p_access_token_hash, p_plan)
  returning id into v_plan_id;

  return jsonb_build_object('plan_id', v_plan_id);
end;
$$;

revoke all on function public.create_learning_submission(text, text, jsonb, jsonb, jsonb, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.create_learning_submission(text, text, jsonb, jsonb, jsonb, timestamptz, boolean) to service_role;

comment on table public.learner_profiles is 'Private learner contact data; server-side Pages Functions only.';
comment on table public.intake_submissions is 'Private Bloom It personalization answers; server-side Pages Functions only.';
comment on table public.learning_plans is 'Private generated plans addressed with a hashed bearer token.';
comment on table public.lesson_progress is 'Private lesson completion keyed to a bearer-token protected plan.';
