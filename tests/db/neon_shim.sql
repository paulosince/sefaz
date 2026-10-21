-- Simula o que a Data API do Neon fornece, para testar o esquema num Postgres local:
-- papéis authenticated/anonymous e auth.user_id() lendo o "sub" do JWT.
-- Aqui o "sub" vem da configuração de sessão request.jwt.claim.sub.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'anonymous') then create role anonymous nologin; end if;
end $$;
create schema if not exists auth;
create or replace function auth.user_id() returns text language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '') $$;
grant usage on schema auth to authenticated, anonymous;
grant usage on schema public to authenticated, anonymous;
