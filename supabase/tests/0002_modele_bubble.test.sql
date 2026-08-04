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

select public.verifier(
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename in ('candidat', 'referent', 'loge', 'document')) = 0,
  'aucune policy sur les données personnelles : donc rien n''est lisible');

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
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
  select public.verifier((select count(*) from public.candidat) = 0,
    'aucun candidat visible — la table est fermée');
  select public.verifier((select count(*) from public.referent) = 0,
    'aucun référent visible');
  select public.verifier((select count(*) from public.parametre) = 1,
    'les réglages, eux, sont lisibles : ils ne contiennent personne');
commit;

\echo ''
\echo 'Tous les contrôles de 0002_modele_bubble.sql sont passés.'
