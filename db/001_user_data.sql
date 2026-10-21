-- Rumo à SEFAZ — dados pessoais de aprendizagem (Neon Auth + Data API).
--
-- Pré-requisitos no console do Neon: Neon Auth ativado (provedor Google) e
-- Data API ativada. A Data API expõe auth.user_id(), que lê o claim "sub" do
-- JWT da requisição. Cada linha pertence a um usuário e as políticas RLS
-- impedem qualquer conta de ler ou gravar linhas de outra (RNF05).
--
-- Idempotente: pode ser executado mais de uma vez.

begin;

-- synced_at: relógio do servidor, usado como cursor de sincronização.
create or replace function public.touch_synced_at() returns trigger
language plpgsql as $$
begin
  new.synced_at := clock_timestamp();
  return new;
end $$;

-- Perfil: um por conta. A área define o percurso (A01 ou C03).
create table if not exists public.user_profiles (
  user_id      text primary key default auth.user_id(),
  display_name text not null,
  area         text not null check (area in ('A01', 'C03')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Respostas: eventos imutáveis com id gerado no aparelho (sem duplicação, RNF06).
-- A chave inclui user_id: um backup restaurado em outra conta não colide.
create table if not exists public.user_answers (
  id          uuid not null,
  user_id     text not null default auth.user_id(),
  question_id text not null,
  chosen      text,
  correct     boolean not null,
  topic_ids   text[] not null default '{}',
  subject_id  text,
  source      text not null default 'estudo' check (source in ('estudo', 'simulado', 'revisao')),
  session_id  text,
  answered_at timestamptz not null,
  elapsed_ms  integer,
  synced_at   timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);
create index if not exists user_answers_user_synced on public.user_answers (user_id, synced_at);

-- Revisões de flashcards: o estado do cartão é recalculado a partir deste log.
create table if not exists public.user_reviews (
  id          uuid not null,
  user_id     text not null default auth.user_id(),
  card_id     text not null,
  grade       smallint not null check (grade between 0 and 3),
  reviewed_at timestamptz not null,
  synced_at   timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);
create index if not exists user_reviews_user_synced on public.user_reviews (user_id, synced_at);

-- Simulados concluídos.
create table if not exists public.user_simulados (
  id          uuid not null,
  user_id     text not null default auth.user_id(),
  kind        text not null,
  config      jsonb not null default '{}',
  started_at  timestamptz not null,
  finished_at timestamptz,
  items       jsonb not null default '[]',
  score       jsonb,
  synced_at   timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);
create index if not exists user_simulados_user_synced on public.user_simulados (user_id, synced_at);

-- Preferências, plano, meta e ponto de retomada: última gravação vence.
create table if not exists public.user_kv (
  user_id    text not null default auth.user_id(),
  key        text not null,
  value      jsonb,
  updated_at timestamptz not null,
  synced_at  timestamptz not null default clock_timestamp(),
  primary key (user_id, key)
);
create index if not exists user_kv_user_synced on public.user_kv (user_id, synced_at);

-- Num conflito de upsert, mantém a versão com updated_at mais recente.
create or replace function public.user_kv_keep_newest() returns trigger
language plpgsql as $$
begin
  if new.updated_at < old.updated_at then
    return old;
  end if;
  new.synced_at := clock_timestamp();
  return new;
end $$;

drop trigger if exists user_kv_newest on public.user_kv;
create trigger user_kv_newest before update on public.user_kv
  for each row execute function public.user_kv_keep_newest();

-- Eventos são imutáveis: bloqueia UPDATE (o cliente só insere).
create or replace function public.reject_update() returns trigger
language plpgsql as $$
begin
  raise exception 'linhas de evento são imutáveis';
end $$;

do $$
declare t text;
begin
  foreach t in array array['user_answers', 'user_reviews', 'user_simulados'] loop
    execute format('drop trigger if exists %I_immutable on public.%I', t, t);
    execute format('create trigger %I_immutable before update on public.%I for each row execute function public.reject_update()', t, t);
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before insert on public.%I for each row execute function public.touch_synced_at()', t, t);
  end loop;
end $$;

-- RLS: cada usuário só enxerga e grava as próprias linhas.
do $$
declare t text;
begin
  foreach t in array array['user_profiles', 'user_answers', 'user_reviews', 'user_simulados', 'user_kv'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists own_rows on public.%I', t);
    execute format(
      'create policy own_rows on public.%I for all to authenticated using (user_id = auth.user_id()) with check (user_id = auth.user_id())', t);
    -- O nome do papel anônimo varia; revoga de quem existir.
    if exists (select 1 from pg_roles where rolname = 'anonymous') then
      execute format('revoke all on public.%I from anonymous', t);
    end if;
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on public.%I from anon', t);
    end if;
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

commit;
