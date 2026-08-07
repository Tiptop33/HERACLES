-- 0006_espace_referent.sql
-- Le lot 3 : un référent travaille sur ses candidats.
--
-- Jusqu'ici la table `candidat` était fermée à double tour — RLS activée, aucune
-- policy — et seule la clé service_role la traversait. Cette migration ouvre
-- exactement ce que les trois écrans de la maquette demandent, et rien de plus :
--
--   * un référent lit et modifie les candidats qu'il accompagne, comme référent
--     ou comme parrain ; les autres n'existent pas pour lui ;
--   * il lit le nom du binôme (référent et parrain) de ces candidats, et le nom
--     des loges concernées — la fiche les affiche ;
--   * il ne crée ni ne supprime aucun candidat : aucun écran ne le fait encore,
--     donc aucune policy ne l'autorise.
--
-- Rien n'ouvre `document` : les documents d'une loge sont l'affaire du lot 5.
-- Les CV et lettres affichés sur la fiche sont des colonnes de `candidat`.

-- ---------------------------------------------------------------------------
-- 1. Ce que l'écran de saisie demande et que Bubble ne gardait pas
--    Bubble n'avait que `adresse` (texte libre) et `adresse_detail` (jsonb).
--    L'écran de modification demande la ville et le code postal séparément :
--    on les stocke séparément. Les fiches reprises gardent leur `adresse`, que
--    l'affichage utilise en repli tant que ces deux colonnes sont vides.
-- ---------------------------------------------------------------------------
alter table public.candidat
  add column if not exists ville       text,
  add column if not exists code_postal text;

comment on column public.candidat.ville is
  'Saisie depuis la fiche. Les fiches reprises de Bubble n''ont que `adresse` : elle sert de repli.';

-- ---------------------------------------------------------------------------
-- 2. Rattacher un compte HERACLES à sa fiche de référent
--    Les 71 comptes repris de Bubble vivent dans `referent`, sans compte de
--    connexion : `profil_id` est vide. Le jour où la personne s'inscrit ici avec
--    la même adresse, les deux se rejoignent — c'est ce que la colonne `email`
--    de la migration 0003 attendait.
--
--    Un compte ne se rattache qu'à UNE fiche : sans quoi « ses » candidats
--    deviendraient ambigus.
-- ---------------------------------------------------------------------------
create unique index if not exists referent_profil_unique
  on public.referent (profil_id)
  where profil_id is not null;

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
   where id = compte and role = 'chercheur';

  return cible;
end;
$$;

comment on function public.rattacher_referent_au_compte(uuid, text) is
  'Relie un compte HERACLES à sa fiche de référent reprise de Bubble, par l''adresse email.';

create or replace function public.rattacher_referent_a_inscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.rattacher_referent_au_compte(new.id, new.email);
  return new;
end;
$$;

-- Déclencheur distinct de `creer_profil_a_inscription` (migration 0001), et
-- nommé pour passer après lui dans l'ordre alphabétique : le profil existe donc
-- déjà quand celui-ci ajuste le rôle.
drop trigger if exists rattacher_referent_a_inscription on auth.users;
create trigger rattacher_referent_a_inscription
  after insert on auth.users
  for each row execute function public.rattacher_referent_a_inscription();

-- ---------------------------------------------------------------------------
-- 3. Qui suis-je, côté métier
--    `security definer` : la fonction lit `referent` sans passer par la RLS de
--    cette table. C'est ce qui évite qu'une policy s'appelle elle-même — une
--    policy sur `referent` qui interroge `referent` ne terminerait jamais.
-- ---------------------------------------------------------------------------
create or replace function public.referent_courant()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select r.id from public.referent r where r.profil_id = auth.uid()
$$;

comment on function public.referent_courant() is
  'La fiche de référent de la personne connectée, ou null si elle n''en a pas.';

-- Les fiches de référent que la personne connectée a le droit de nommer : la
-- sienne, et celles qui accompagnent ses candidats (la fiche affiche « Référent »
-- et « Parrain »).
create or replace function public.referents_visibles()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select public.referent_courant()
  where public.referent_courant() is not null
  union
  select c.referent_id
    from public.candidat c
   where c.referent_id is not null
     and (c.referent_id = public.referent_courant()
       or c.parrain_id  = public.referent_courant())
  union
  select c.parrain_id
    from public.candidat c
   where c.parrain_id is not null
     and (c.referent_id = public.referent_courant()
       or c.parrain_id  = public.referent_courant())
$$;

-- Les loges qu'elle a le droit de nommer : la sienne, et celles de ses candidats.
create or replace function public.loges_visibles()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select r.loge_id
    from public.referent r
   where r.profil_id = auth.uid() and r.loge_id is not null
  union
  select c.loge_id
    from public.candidat c
   where c.loge_id is not null
     and (c.referent_id = public.referent_courant()
       or c.parrain_id  = public.referent_courant())
$$;

-- ---------------------------------------------------------------------------
-- 4. Les règles d'accès
--    `(select public.referent_courant())` et non `public.referent_courant()` :
--    entre parenthèses, PostgreSQL évalue la fonction une fois pour toute la
--    requête au lieu d'une fois par ligne.
--
--    Quand la personne n'a pas de fiche de référent, la fonction renvoie null,
--    `referent_id = null` vaut null — donc jamais vrai — et aucune ligne ne
--    sort. Fermé par défaut, sans avoir à l'écrire.
-- ---------------------------------------------------------------------------
drop policy if exists candidat_lecture_accompagnes on public.candidat;
create policy candidat_lecture_accompagnes on public.candidat
  for select
  to authenticated
  using (
    referent_id = (select public.referent_courant())
    or parrain_id = (select public.referent_courant())
  );

drop policy if exists candidat_modification_accompagnes on public.candidat;
create policy candidat_modification_accompagnes on public.candidat
  for update
  to authenticated
  using (
    referent_id = (select public.referent_courant())
    or parrain_id = (select public.referent_courant())
  )
  with check (
    referent_id = (select public.referent_courant())
    or parrain_id = (select public.referent_courant())
  );

-- Ni insertion ni suppression : aucun écran ne crée ni ne supprime de candidat
-- au lot 3. La policy viendra avec l'écran qui la justifie.

drop policy if exists referent_lecture_binome on public.referent;
create policy referent_lecture_binome on public.referent
  for select
  to authenticated
  using (id in (select * from public.referents_visibles()));

drop policy if exists loge_lecture_sienne on public.loge;
create policy loge_lecture_sienne on public.loge
  for select
  to authenticated
  using (id in (select * from public.loges_visibles()));

-- ---------------------------------------------------------------------------
-- 5. Le rattachement ne se change pas depuis l'application
--    La maquette affiche le référent en lecture seule : « le rattachement se
--    change depuis l'administration de la loge ». Un champ désactivé dans une
--    page ne protège rien — c'est ici que ça se fige.
--
--    Même procédé que pour le rôle dans la migration 0001 : on remet l'ancienne
--    valeur. `auth.uid()` est nul sous clé service_role, l'administration garde
--    donc la main.
-- ---------------------------------------------------------------------------
create or replace function public.candidat_avant_modification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.referent_id := old.referent_id;
    new.parrain_id  := old.parrain_id;
    new.loge_id     := old.loge_id;
    new.numero      := old.numero;
    new.profil_id   := old.profil_id;
    new.bubble_id   := old.bubble_id;
  end if;

  return new;
end;
$$;

drop trigger if exists candidat_avant_modification on public.candidat;
create trigger candidat_avant_modification
  before update on public.candidat
  for each row execute function public.candidat_avant_modification();

-- ---------------------------------------------------------------------------
-- 6. Rattacher les comptes déjà inscrits
--    Rejouable : `rattacher_referent_au_compte` ne touche que les fiches libres
--    et s'arrête net si le compte est déjà rattaché.
-- ---------------------------------------------------------------------------
do $$
declare
  compte record;
begin
  if to_regclass('auth.users') is null then
    return;
  end if;

  for compte in select u.id, u.email from auth.users u where u.email is not null
  loop
    perform public.rattacher_referent_au_compte(compte.id, compte.email);
  end loop;
end
$$;
