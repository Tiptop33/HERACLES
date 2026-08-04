-- 0001_profil.sql
-- Le socle des comptes : chaque utilisateur authentifié possède un profil, et
-- un rôle — chercheur (la personne accompagnée) ou référent (celle qui
-- accompagne) — choisi au moment de l'inscription.

-- 1. Le rôle ---------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'role_utilisateur') then
    create type public.role_utilisateur as enum ('chercheur', 'referent', 'admin');
  end if;
end
$$;

-- 2. Le profil --------------------------------------------------------------
create table if not exists public.profil (
  id            uuid primary key references auth.users (id) on delete cascade,
  role          public.role_utilisateur not null default 'chercheur',
  nom           text,
  prenom        text,
  telephone     text,
  ville         text,
  code_postal   text,
  presentation  text,
  cree_le       timestamptz not null default now(),
  maj_le        timestamptz not null default now()
);

comment on table public.profil is
  'Profil d''un utilisateur, en 1-1 avec auth.users. Le rôle y est figé après création.';

-- 3. Règles d'accès ---------------------------------------------------------
-- Chacun ne voit et ne modifie que sa propre ligne. Aucune policy d'insertion
-- ni de suppression : le profil naît avec le compte (déclencheur ci-dessous) et
-- meurt avec lui (on delete cascade).
alter table public.profil enable row level security;

drop policy if exists profil_lecture_soi on public.profil;
create policy profil_lecture_soi on public.profil
  for select
  using (auth.uid() = id);

drop policy if exists profil_modification_soi on public.profil;
create policy profil_modification_soi on public.profil
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 4. Création automatique du profil à l'inscription -------------------------
create or replace function public.creer_profil_a_inscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  role_demande text := coalesce(new.raw_user_meta_data ->> 'role', 'chercheur');
begin
  -- Les métadonnées d'inscription viennent du client : on n'accepte que les
  -- deux rôles choisissables, pour que personne ne s'auto-promeuve
  -- administrateur en glissant « admin » dans le formulaire.
  if role_demande not in ('chercheur', 'referent') then
    role_demande := 'chercheur';
  end if;

  insert into public.profil (id, role, nom, prenom)
  values (
    new.id,
    role_demande::public.role_utilisateur,
    nullif(trim(new.raw_user_meta_data ->> 'nom'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'prenom'), '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists creer_profil_a_inscription on auth.users;
create trigger creer_profil_a_inscription
  after insert on auth.users
  for each row execute function public.creer_profil_a_inscription();

-- 5. Le rôle ne se change pas depuis l'application --------------------------
-- La policy de modification laisse l'usager écrire toute sa ligne, rôle
-- compris. On remet donc l'ancienne valeur au passage. Les opérations
-- d'administration passent par la clé service_role — auth.uid() est alors nul
-- et le rôle peut être ajusté.
create or replace function public.profil_avant_modification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and new.role is distinct from old.role then
    new.role := old.role;
  end if;

  new.maj_le := now();
  return new;
end;
$$;

drop trigger if exists profil_avant_modification on public.profil;
create trigger profil_avant_modification
  before update on public.profil
  for each row execute function public.profil_avant_modification();
