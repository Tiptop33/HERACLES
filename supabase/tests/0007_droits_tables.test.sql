-- Tests de la migration 0007_droits_tables.sql.
--
-- Deux verrous protègent une table, et il faut les deux : le GRANT dit à
-- quelles tables un rôle peut s'adresser, la RLS dit quelles lignes il en
-- obtient. Ce fichier éprouve le premier — le second est éprouvé par 0001 et
-- 0006.
--
-- Ce qu'on vérifie ici a une histoire : les migrations ne posaient aucun GRANT,
-- et l'application ne lisait donc **aucune** table contre un vrai Supabase.

\set ON_ERROR_STOP on
\o /dev/null

-- Refuse-t-on bien l'accès à cette table pour ce rôle ?
create or replace function public.refuse(role_teste text, table_visee text)
returns boolean
language plpgsql
as $$
begin
  execute format('set local role %I', role_teste);
  begin
    execute format('select 1 from public.%I limit 1', table_visee);
    reset role;
    return false;
  exception when insufficient_privilege then
    reset role;
    return true;
  end;
end;
$$;

-- Et l'autorise-t-on ? (« autorisé » ne veut pas dire « des lignes sortent » :
-- c'est la RLS qui en décide ensuite.)
create or replace function public.autorise(role_teste text, table_visee text)
returns boolean
language plpgsql
as $$
begin
  execute format('set local role %I', role_teste);
  begin
    execute format('select 1 from public.%I limit 1', table_visee);
    reset role;
    return true;
  exception when insufficient_privilege then
    reset role;
    return false;
  end;
end;
$$;

\echo '— anon ne touche à rien'
select public.verifier(
  public.refuse('anon', 'candidat') and public.refuse('anon', 'referent')
    and public.refuse('anon', 'profil') and public.refuse('anon', 'loge'),
  'sans être connecté, aucune table de personnes n''est même adressable');

select public.verifier(
  public.refuse('anon', 'offre_emploi') and public.refuse('anon', 'parametre'),
  'ni les offres, ni les réglages');

\echo '— authenticated atteint ce que les écrans affichent'
select public.verifier(
  public.autorise('authenticated', 'profil')
    and public.autorise('authenticated', 'candidat')
    and public.autorise('authenticated', 'referent')
    and public.autorise('authenticated', 'loge')
    and public.autorise('authenticated', 'offre_emploi')
    and public.autorise('authenticated', 'parametre'),
  'les six tables que le lot 3 affiche sont adressables');

\echo '— et rien d autre'
-- `document` s'est ajouté depuis, avec l'accueil qui les liste (migration
-- 0011). Il n'était pas dans la liste du lot 3, et c'était juste : on n'ouvre
-- une table que le jour où un écran la réclame.
select public.verifier(
  public.autorise('authenticated', 'document'),
  'les documents se sont ouverts avec l''accueil, et pas avant');

select public.verifier(
  public.refuse('authenticated', 'entreprise')
    and public.refuse('authenticated', 'loge_membre')
    and public.refuse('authenticated', 'bubble_brut'),
  'entreprises, membres de loge et table brute restent hors d''atteinte');

\echo '— écrire : seulement là où un écran écrit'
-- On nomme les tables plutôt que de les compter : un décompte dit qu'une
-- table s'est ouverte, jamais laquelle. `college` (0017) s'y ajoute — c'est un
-- référentiel sans donnée personnelle, et sa policy le réserve de toute façon
-- aux administrateurs.
select public.verifier(
  (select array_agg(distinct table_name::text order by table_name::text)
     from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'authenticated'
      and privilege_type = 'UPDATE')
   = array['candidat', 'college', 'profil'],
  'trois tables modifiables en entier, et on sait lesquelles');

-- Supprimer : une seule table, et c'est le référentiel des titres. Nulle part
-- ailleurs un écran n'efface une ligne entière — la fiche d'un référent passe
-- par une fonction qui refuse quatre fois (0016).
select public.verifier(
  (select array_agg(distinct table_name::text order by table_name::text)
     from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'authenticated'
      and privilege_type = 'DELETE')
   = array['college'],
  'seul le référentiel des titres se supprime depuis un écran');

-- Un droit peut aussi se donner colonne par colonne, et cette vue-là ne le
-- montre pas. Sans le contrôle qui suit, on croirait la liste ci-dessus
-- complète alors qu'une table s'est entrouverte ailleurs. L'annuaire (0012)
-- a ouvert six colonnes de `referent` — six, et pas `profil_id` ni
-- `bubble_id`, qui rattachent une fiche à un compte et à la reprise.
select public.verifier(
  (select array_agg(column_name::text order by column_name::text)
     from information_schema.role_column_grants
    where table_schema = 'public' and grantee = 'authenticated'
      and privilege_type = 'UPDATE' and table_name = 'referent')
  = array['college', 'email', 'loge_id', 'nom', 'prenom', 'telephone'],
  'de `referent`, six colonnes exactement — jamais le rattachement au compte');

select public.verifier(
  (select count(distinct table_name) from information_schema.role_column_grants
    where table_schema = 'public' and grantee = 'authenticated'
      and privilege_type = 'UPDATE'
      and table_name not in ('profil', 'candidat', 'referent', 'college')) = 0,
  'et aucune autre table ne s''est entrouverte par une colonne');

-- Insérer : le référentiel des titres, et lui seul. Ni un candidat, ni un
-- référent, ni une loge ne se créent depuis un écran — c'est encore vrai après
-- 0017, et ce contrôle est là pour le dire le jour où ça changera par
-- inadvertance.
select public.verifier(
  (select array_agg(distinct table_name::text order by table_name::text)
     from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'authenticated'
      and privilege_type = 'INSERT')
   = array['college'],
  'seul le référentiel des titres reçoit des insertions');

\echo '— les fonctions des policies sont exécutables'
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}';
  select public.verifier((select public.referent_courant()) is not null,
    'un référent connecté peut appeler referent_courant() — sinon la policy échouerait avant de trancher');
commit;

\echo '— service_role garde la main sur tout'
select public.verifier(
  public.autorise('service_role', 'document') and public.autorise('service_role', 'bubble_brut'),
  'la clé d''administration atteint jusqu''aux tables fermées');

\echo ''
\echo 'Tous les contrôles de 0007_droits_tables.sql sont passés.'
