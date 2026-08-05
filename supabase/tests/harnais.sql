-- Harnais de test : le strict minimum de Supabase, sur un PostgreSQL nu.
--
-- Il ne sert QU'AUX TESTS. En vrai, tout ceci est fourni par la pile Supabase ;
-- on le reconstitue ici pour pouvoir jouer les migrations et éprouver la RLS
-- sans lancer les dix conteneurs de la pile complète.

-- Les rôles de Supabase.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

-- Le schéma d'authentification et sa table d'utilisateurs, réduits à ce que la
-- migration utilise réellement.
create schema if not exists auth;

create table if not exists auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text unique,
  raw_user_meta_data  jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

-- auth.uid() : l'identifiant de l'utilisateur porté par le jeton de la requête.
-- Même définition que chez Supabase — elle lit un paramètre de session, ce qui
-- permet aux tests de « devenir » n'importe quel utilisateur.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;

-- Privilèges par défaut du schéma public, reproduits **tels que Supabase les
-- pose pour le rôle `postgres`** — celui qui joue les migrations.
--
-- Ce détail a son importance. On avait d'abord écrit ici « grant all », en
-- croyant qu'une migration n'a jamais à poser de GRANT. C'est faux : pour une
-- table créée par `postgres`, Supabase ne donne à `anon` et `authenticated` que
-- `truncate`, `references` et `trigger`. Pas de `select`. Le harnais, trop
-- généreux, laissait passer des tests qui échouaient en vrai.
--
-- Il reproduit donc maintenant la vraie parcimonie : c'est aux migrations
-- d'ouvrir ce dont elles ont besoin (voir 0007_droits_tables.sql), et un test
-- de RLS n'a de valeur que si le GRANT qui le précède est celui de production.
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;

alter default privileges in schema public
  grant truncate, references, trigger on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant update on sequences to anon, authenticated, service_role;

-- Chez Supabase, une fonction créée par `postgres` n'est pas exécutable par
-- `anon` ni `authenticated` sans GRANT explicite. Or une policy qui appelle une
-- fonction l'évalue avec les droits de l'appelant.
alter default privileges in schema public revoke execute on functions from public;
