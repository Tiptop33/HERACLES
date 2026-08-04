-- Tests de la migration 0001_profil.sql.
-- Ce qui est éprouvé ici, ce n'est pas le SQL « qui passe », c'est la sécurité :
-- personne ne se promeut administrateur, personne ne lit ni ne modifie le
-- dossier d'un autre.

\set ON_ERROR_STOP on

-- Les résultats des requêtes ne nous intéressent pas : ce qu'on lit, ce sont
-- les « ok — … » émis par verifier(), et la première exception qui arrête tout.
\o /dev/null

create or replace function public.verifier(condition boolean, intitule text)
returns void
language plpgsql
as $$
begin
  if condition is not true then
    raise exception 'ÉCHEC — %', intitule;
  end if;
  raise notice '  ok — %', intitule;
end;
$$;

\set alice   '11111111-1111-1111-1111-111111111111'
\set bob     '22222222-2222-2222-2222-222222222222'
\set mallory '33333333-3333-3333-3333-333333333333'
\set muet    '44444444-4444-4444-4444-444444444444'

-- Quatre inscriptions. Mallory demande « admin » ; le quatrième n'envoie aucune
-- métadonnée, comme le ferait une inscription par lien magique.
insert into auth.users (id, email, raw_user_meta_data) values
  (:'alice',   'alice@example.org',   '{"role":"chercheur","nom":"Martin","prenom":"Alice"}'),
  (:'bob',     'bob@example.org',     '{"role":"referent","nom":"Durand","prenom":"Bob"}'),
  (:'mallory', 'mallory@example.org', '{"role":"admin","nom":"Roux","prenom":"Mallory"}'),
  (:'muet',    'muet@example.org',    '{}');

\echo '— création automatique du profil'
select public.verifier((select count(*) from public.profil) = 4,
  'un profil naît avec chaque compte');
select public.verifier((select role from public.profil where id = :'alice') = 'chercheur',
  'le rôle chercheur demandé est respecté');
select public.verifier((select role from public.profil where id = :'bob') = 'referent',
  'le rôle référent demandé est respecté');
select public.verifier((select prenom from public.profil where id = :'alice') = 'Alice',
  'le prénom donné à l''inscription est repris');

\echo '— personne ne se proclame administrateur'
select public.verifier((select role from public.profil where id = :'mallory') = 'chercheur',
  'demander « admin » dans le formulaire ne donne que « chercheur »');
select public.verifier((select role from public.profil where id = :'muet') = 'chercheur',
  'sans métadonnées, le rôle retombe sur chercheur');

\echo '— lecture : chacun chez soi'
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
  select public.verifier((select count(*) from public.profil) = 1,
    'Alice ne voit qu''une seule ligne');
  select public.verifier((select id from public.profil) = :'alice',
    'et c''est la sienne — le profil de Bob lui est invisible');
commit;

\echo '— écriture : chacun chez soi'
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
  update public.profil set ville = 'Détournée' where id = :'bob';
commit;
select public.verifier((select ville from public.profil where id = :'bob') is null,
  'Alice ne modifie pas le profil de Bob');

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
  update public.profil set ville = 'Bordeaux', presentation = 'En recherche d''alternance.'
    where id = :'alice';
commit;
select public.verifier((select ville from public.profil where id = :'alice') = 'Bordeaux',
  'Alice modifie bien son propre profil');
select public.verifier((select maj_le > cree_le from public.profil where id = :'alice'),
  'la date de mise à jour avance toute seule');

\echo '— le rôle est figé, même en écrivant directement en base'
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333"}';
  update public.profil set role = 'admin' where id = :'mallory';
commit;
select public.verifier((select role from public.profil where id = :'mallory') = 'chercheur',
  'une requête directe « set role = admin » reste sans effet');

\echo '— mais l administration, elle, peut ajuster un rôle'
begin;
  set local role service_role;
  update public.profil set role = 'admin' where id = :'muet';
commit;
select public.verifier((select role from public.profil where id = :'muet') = 'admin',
  'la clé service_role fait autorité (aucun jeton, donc aucun blocage)');

\echo '— le profil meurt avec le compte'
delete from auth.users where id = :'mallory';
select public.verifier((select count(*) from public.profil where id = :'mallory') = 0,
  'supprimer le compte supprime le profil');

\echo ''
\echo 'Tous les contrôles de 0001_profil.sql sont passés.'
