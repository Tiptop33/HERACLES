-- 0008_mots_de_passe_anciens.sql
-- « Différent des 3 derniers » : la troisième règle de l'écran 3 de la maquette.
--
-- Les deux premières règles — douze caractères, une majuscule et un chiffre —
-- se vérifient en lisant le mot de passe. Celle-ci demande de la mémoire, et
-- cette mémoire n'existait nulle part : Supabase ne garde que l'empreinte du
-- mot de passe **courant**.
--
-- Ce qui est stocké, ce sont des empreintes bcrypt, jamais les mots de passe.
-- On ne peut pas les relire ; on peut seulement demander « celui-ci
-- correspond-il ? ». C'est tout ce dont la règle a besoin.
--
-- La table est fermée : RLS active, aucune policy, aucun GRANT. Ni `anon` ni
-- `authenticated` ne l'atteignent — seule la clé service_role, depuis une route
-- serveur qui a d'abord vérifié la session.

create extension if not exists pgcrypto;

create table if not exists public.mot_de_passe_ancien (
  id          uuid primary key default gen_random_uuid(),
  profil_id   uuid not null references public.profil (id) on delete cascade,
  empreinte   text not null,
  cree_le     timestamptz not null default now()
);

comment on table public.mot_de_passe_ancien is
  'Empreintes des mots de passe précédents, pour interdire de réutiliser les trois derniers. Jamais de mot de passe en clair.';

create index if not exists mot_de_passe_ancien_profil_idx
  on public.mot_de_passe_ancien (profil_id, cree_le desc);

alter table public.mot_de_passe_ancien enable row level security;

-- Aucune policy : la table n'est lisible que sous clé service_role.

-- ---------------------------------------------------------------------------
-- Ce mot de passe a-t-il déjà servi récemment ?
--   `security definer` : la fonction lit la table sans policy. Elle ne renvoie
--   qu'un booléen — jamais une empreinte, jamais une date.
-- ---------------------------------------------------------------------------
create or replace function public.mot_de_passe_deja_utilise(compte uuid, clair text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1
      from (
        select empreinte
          from public.mot_de_passe_ancien
         where profil_id = compte
         order by cree_le desc
         limit 3
      ) as derniers
     where derniers.empreinte = crypt(clair, derniers.empreinte)
  )
$$;

comment on function public.mot_de_passe_deja_utilise(uuid, text) is
  'Vrai si ce mot de passe est l''un des trois derniers de ce compte.';

-- ---------------------------------------------------------------------------
-- Retenir un mot de passe qui vient d'être choisi
--   On ne garde que les quatre derniers : trois pour la règle, plus celui qui
--   vient d'être posé. Au-delà, ce serait conserver sans raison.
-- ---------------------------------------------------------------------------
create or replace function public.retenir_mot_de_passe(compte uuid, clair text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  insert into public.mot_de_passe_ancien (profil_id, empreinte)
  values (compte, crypt(clair, gen_salt('bf')));

  delete from public.mot_de_passe_ancien
   where profil_id = compte
     and id not in (
       select id from public.mot_de_passe_ancien
        where profil_id = compte
        order by cree_le desc
        limit 4
     );
end;
$$;

-- Ces deux fonctions ne s'appellent que sous clé service_role : on retire le
-- droit d'exécution à tout le monde d'abord, plutôt que de compter dessus.
revoke all on function public.mot_de_passe_deja_utilise(uuid, text) from public, anon, authenticated;
revoke all on function public.retenir_mot_de_passe(uuid, text) from public, anon, authenticated;
grant execute on function public.mot_de_passe_deja_utilise(uuid, text) to service_role;
grant execute on function public.retenir_mot_de_passe(uuid, text) to service_role;
