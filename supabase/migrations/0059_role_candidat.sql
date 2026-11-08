-- ---------------------------------------------------------------------------
-- 0059 — le rôle « chercheur » s'appelle désormais « candidat »
--
-- Ce que ça change : la valeur `chercheur` de `role_utilisateur` devient
-- `candidat`. Le lot 1 l'avait nommée avant que le vocabulaire soit tranché ;
-- `CLAUDE.md` interdit depuis « chercheur » à la place de « candidat ». Le rôle
-- n'avait jusqu'ici aucun usage réel. Il en reçoit un avec l'espace candidat
-- (spec du 7 novembre 2026) : c'est le moment de le nommer juste, avant que des
-- comptes s'y rattachent.
--
-- `rename value` garde l'OID de la valeur : les profils qui la portent, et le
-- défaut de `profil.role`, suivent d'eux-mêmes. Il reste les deux fonctions qui
-- écrivent le mot en toutes lettres, redéfinies plus bas.
--
-- LE SECOND PASSAGE
--
-- Le serveur rejoue toutes les migrations à chaque déploiement. 0001 et 0006
-- recréent alors leurs fonctions avec l'ancien mot, et celle-ci les rétablit
-- quelques secondes plus tard. On ne retouche pas ces deux migrations déjà
-- livrées : elles restent l'histoire de la base, et cette fenêtre ne dure que
-- le temps d'un déploiement.
-- ---------------------------------------------------------------------------

-- 1. La valeur ---------------------------------------------------------------
do $$
begin
  if exists (
    select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'role_utilisateur' and e.enumlabel = 'chercheur'
  ) then
    alter type public.role_utilisateur rename value 'chercheur' to 'candidat';
  end if;
end
$$;

-- Le défaut suit déjà, par l'OID. On l'écrit quand même : c'est ce que lirait
-- quelqu'un qui ouvre la table.
alter table public.profil alter column role set default 'candidat';

-- 2. La création du profil à l'inscription (reprise de 0001) ------------------
create or replace function public.creer_profil_a_inscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  role_demande text := coalesce(new.raw_user_meta_data ->> 'role', 'candidat');
begin
  -- Les métadonnées d'inscription viennent du client : on n'accepte que les
  -- deux rôles choisissables, pour que personne ne s'auto-promeuve
  -- administrateur en glissant « admin » dans le formulaire.
  if role_demande not in ('candidat', 'referent') then
    role_demande := 'candidat';
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

-- 3. Le rattachement d'un référent à son compte (reprise de 0006) ------------
create or replace function public.rattacher_referent_au_compte(compte uuid, adresse text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  cible uuid;
begin
  if compte is null or adresse is null or trim(adresse) = '' then
    return null;
  end if;

  -- Déjà rattaché : rien à faire, et surtout rien à déplacer.
  select r.id into cible from public.referent r where r.profil_id = compte;
  if cible is not null then
    return cible;
  end if;

  -- La plus ancienne fiche libre portant cette adresse. `order by` plutôt qu'un
  -- simple `limit 1` : deux fiches homonymes ne doivent pas donner un résultat
  -- qui change d'une exécution à l'autre.
  select r.id into cible
    from public.referent r
   where r.profil_id is null
     and r.email is not null
     and lower(trim(r.email)) = lower(trim(adresse))
   order by r.cree_le, r.id
   limit 1;

  if cible is null then
    return null;
  end if;

  update public.referent set profil_id = compte where id = cible;

  -- La base sait maintenant que cette personne accompagne des candidats dans une
  -- loge : son rôle suit. Ce n'est pas une promotion — « referent » se choisit
  -- déjà librement à l'inscription, et c'est la RLS, pas le rôle, qui décide de
  -- ce qui est lisible. Le rôle ne fait qu'ouvrir la bonne page d'accueil.
  update public.profil set role = 'referent'
   where id = compte and role = 'candidat';

  return cible;
end;
$$;
