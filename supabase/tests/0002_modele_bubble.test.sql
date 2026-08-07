-- Tests de la migration 0002_modele_bubble.sql.
-- On vérifie que la structure est là, mais surtout qu'elle est FERMÉE : le
-- modèle d'origine, sur Bubble, était lisible par tout Internet.

\set ON_ERROR_STOP on
\o /dev/null

\echo '— les huit tables existent'
select public.verifier(
  (select count(*) from information_schema.tables
    where table_schema = 'public'
      and table_name in ('loge', 'loge_membre', 'referent', 'candidat',
                         'entreprise', 'offre_emploi', 'document', 'parametre')) = 8,
  'les sept types Bubble et la table de liaison sont créés');

select public.verifier(
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'candidat') >= 50,
  'candidat porte bien ses cinquante champs et quelques');

\echo '— tout est sous RLS'
select public.verifier(
  (select bool_and(rowsecurity) from pg_tables
    where schemaname = 'public'
      and tablename in ('loge', 'loge_membre', 'referent', 'candidat',
                        'entreprise', 'offre_emploi', 'document', 'parametre')),
  'la RLS est active sur les huit tables');

-- Cette migration-ci n'ouvre rien. Les ouvertures sont venues après, et
-- chacune avec l'écran qui la justifie : `candidat`, `referent` et `loge` avec
-- l'espace référent (0006), `document` avec l'accueil (0011). Chaque fois, le
-- test de la migration prouve la limite en devenant tour à tour chaque
-- personne.
--
-- Ce qui se vérifie ici, c'est que l'ouverture ne va jamais plus loin que ce
-- qui a été demandé : les tables qu'aucun écran ne réclame restent sans la
-- moindre policy. Le jour où l'une d'elles en reçoit une, cette ligne tombe —
-- et c'est très bien : elle oblige à écrire pourquoi.
select public.verifier(
  (select count(*) from pg_policies
    where schemaname = 'public'
      and tablename in ('entreprise', 'loge_membre')) = 0,
  'entreprises et membres de loge : toujours aucune policy, donc rien de lisible');

-- `document` s'est ouvert, mais en lecture seule et pas à tout le monde.
select public.verifier(
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'document'
      and cmd in ('INSERT', 'UPDATE', 'DELETE')) = 0,
  'un document se lit, ne s''écrit pas : la reprise reste la seule à en poser');

select public.verifier(
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'candidat'
      and cmd in ('INSERT', 'DELETE')) = 0,
  'personne ne peut créer ni supprimer un candidat depuis l''application');

\echo '— les liens tiennent'
insert into public.loge (bubble_id, nom) values ('loge-1', 'Loge d''essai');
insert into public.referent (bubble_id, nom, prenom, loge_id)
  values ('ref-1', 'Durand', 'Bob', (select id from public.loge where bubble_id = 'loge-1'));
insert into public.candidat (bubble_id, nom, prenom, telephone, loge_id, referent_id)
  values ('cand-1', 'Martin', 'Alice', '0033765730385',
          (select id from public.loge where bubble_id = 'loge-1'),
          (select id from public.referent where bubble_id = 'ref-1'));

select public.verifier(
  (select telephone from public.candidat where bubble_id = 'cand-1') = '0033765730385',
  'un téléphone garde ses zéros — il est stocké en texte, pas en nombre');

select public.verifier(
  (select r.nom from public.candidat c join public.referent r on r.id = c.referent_id
     where c.bubble_id = 'cand-1') = 'Durand',
  'le candidat est bien rattaché à son référent');

\echo '— supprimer une loge ne détruit pas ses candidats'
delete from public.loge where bubble_id = 'loge-1';
select public.verifier(
  (select count(*) from public.candidat where bubble_id = 'cand-1') = 1,
  'le candidat survit à la suppression de sa loge');
select public.verifier(
  (select loge_id from public.candidat where bubble_id = 'cand-1') is null,
  'et son rattachement est simplement vidé');

\echo '— la date de mise à jour avance toute seule'
update public.candidat set nom = 'Martin-Dupont' where bubble_id = 'cand-1';
select public.verifier(
  (select maj_le > cree_le from public.candidat where bubble_id = 'cand-1'),
  'maj_le suit la modification');

\echo '— les réglages n''ont qu''une ligne'
insert into public.parametre (bubble_id, lieu_reunion) values ('global-1', 'Bordeaux');
do $$
begin
  begin
    insert into public.parametre (id, bubble_id) values (false, 'global-2');
    raise exception 'ÉCHEC — une deuxième ligne de réglages a été acceptée';
  exception when check_violation then
    raise notice '  ok — une deuxième ligne de réglages est refusée';
  end;
end
$$;

\echo '— ce que voit une personne simplement connectée'
-- Alice, inscrite au test 0001, n'accompagne personne : aucune fiche de
-- référent ne porte son compte.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
  select public.verifier((select count(*) from public.candidat) = 0,
    'aucun candidat visible — être connecté ne donne accès à personne');
  select public.verifier((select count(*) from public.referent) = 0,
    'aucun référent visible');
  select public.verifier((select count(*) from public.parametre) = 1,
    'les réglages, eux, sont lisibles : ils ne contiennent personne');
commit;

\echo ''
\echo 'Tous les contrôles de 0002_modele_bubble.sql sont passés.'
