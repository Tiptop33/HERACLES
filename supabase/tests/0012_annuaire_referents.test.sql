-- Tests de la migration 0012_annuaire_referents.sql.
--
-- L'annuaire élargit une lecture : un référent voit désormais ses collègues de
-- loge. Ce fichier vérifie que l'élargissement s'arrête à la loge, que la
-- modification reste aux administrateurs, et qu'elle ne touche pas les deux
-- colonnes qui rattachent une fiche à un compte.
--
-- Quatre personnes, deux loges :
--   · Denis   référent à Bordeaux-0012, avec deux candidats
--   · Elsa    référente à Bordeaux-0012, sa collègue
--   · Farid   référent à Toulouse-0012 — il ne doit rien voir de Bordeaux
--   · Gaby    administratrice, sans loge — elle voit tout

\set ON_ERROR_STOP on
\o /dev/null

\set denis 'eeeeeeee-0000-0000-0000-00000000000d'
\set elsa  'eeeeeeee-0000-0000-0000-00000000000e'
\set farid 'eeeeeeee-0000-0000-0000-00000000000f'
\set gaby  'eeeeeeee-0000-0000-0000-00000000000a'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'denis', 'denis@example.org', '{"role":"referent","nom":"Diderot","prenom":"Denis"}'),
  (:'elsa',  'elsa@example.org',  '{"role":"referent","nom":"Triolet","prenom":"Elsa"}'),
  (:'farid', 'farid@example.org', '{"role":"referent","nom":"Boudjellal","prenom":"Farid"}'),
  (:'gaby',  'gaby@example.org',  '{"role":"referent","nom":"Cohen","prenom":"Gaby"}');
update public.profil set role = 'admin' where id = :'gaby';

insert into public.loge (bubble_id, nom) values
  ('loge-0012-bordeaux', 'Bordeaux — 0012'),
  ('loge-0012-toulouse', 'Toulouse — 0012')
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, email, telephone, loge_id) values
  ('ref-0012-denis', :'denis', 'Diderot',    'Denis', 'denis@example.org', '06 00 00 00 01',
   (select id from public.loge where bubble_id = 'loge-0012-bordeaux')),
  ('ref-0012-elsa',  :'elsa',  'Triolet',    'Elsa',  'elsa@example.org',  '06 00 00 00 02',
   (select id from public.loge where bubble_id = 'loge-0012-bordeaux')),
  -- Une fiche sans compte : elle doit apparaître dans l'annuaire, signalée.
  ('ref-0012-sans',  null,     'Sanscompte', 'Simone', 'simone@example.org', null,
   (select id from public.loge where bubble_id = 'loge-0012-bordeaux')),
  ('ref-0012-farid', :'farid', 'Boudjellal', 'Farid', 'farid@example.org', '06 00 00 00 03',
   (select id from public.loge where bubble_id = 'loge-0012-toulouse'))
on conflict do nothing;

insert into public.candidat (bubble_id, nom, prenom, loge_id, referent_id) values
  ('cand-0012-un',   'Un',   'Alpha', (select id from public.loge where bubble_id = 'loge-0012-bordeaux'),
   (select id from public.referent where bubble_id = 'ref-0012-denis')),
  ('cand-0012-deux', 'Deux', 'Beta',  (select id from public.loge where bubble_id = 'loge-0012-bordeaux'),
   (select id from public.referent where bubble_id = 'ref-0012-denis')),
  -- Clôturé : il ne doit pas compter.
  ('cand-0012-clos', 'Clos', 'Gamma', (select id from public.loge where bubble_id = 'loge-0012-bordeaux'),
   (select id from public.referent where bubble_id = 'ref-0012-denis'))
on conflict do nothing;
update public.candidat set cloture = 'Emploi trouvé' where bubble_id = 'cand-0012-clos';

-- ---------------------------------------------------------------------------
\echo '— un referent voit sa loge, et rien au-dela'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"eeeeeeee-0000-0000-0000-00000000000d"}';

  select public.verifier(
    (select count(*) from public.annuaire_referents()
      where nom in ('Diderot', 'Triolet', 'Sanscompte')) = 3,
    'Denis voit les trois fiches de Bordeaux, la sienne comprise');

  select public.verifier(
    (select count(*) from public.annuaire_referents() where nom = 'Boudjellal') = 0,
    'et jamais celle de Toulouse');

  select public.verifier(
    (select candidats_suivis from public.annuaire_referents() where nom = 'Diderot') = 2,
    'deux candidats accompagnés — le dossier clôturé ne compte pas');

  select public.verifier(
    (select compte_rattache from public.annuaire_referents() where nom = 'Sanscompte') = false
      and (select compte_rattache from public.annuaire_referents() where nom = 'Triolet') = true,
    'l''annuaire dit qui a un compte et qui n''en a pas encore');
commit;

-- ---------------------------------------------------------------------------
\echo '— l annuaire ne rend pas toute la fiche'
-- ---------------------------------------------------------------------------
select public.verifier(
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'annuaire_referents'
      and column_name in ('immatriculation', 'grade', 'officier', 'derniere_visite',
                          'appel', 'telephone_secondaire')) = 0,
  'ni immatriculation, ni grade, ni officier : joindre quelqu''un, pas le passer en revue');

-- ---------------------------------------------------------------------------
\echo '— la table elle-meme n a pas ete ouverte en grand'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"eeeeeeee-0000-0000-0000-00000000000d"}';
  -- Simone n'accompagne aucun de ses candidats : elle reste hors de sa vue
  -- directe, alors qu'elle figure dans l'annuaire. C'est toute la différence
  -- entre « ce que l'écran montre » et « ce que la table laisse lire ».
  select public.verifier(
    (select count(*) from public.referent where bubble_id = 'ref-0012-sans') = 0,
    'Denis lit Simone dans l''annuaire, pas dans la table');
commit;

-- ---------------------------------------------------------------------------
\echo '— un referent ne modifie pas la fiche d un autre'
-- ---------------------------------------------------------------------------
do $$
declare touche integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"eeeeeeee-0000-0000-0000-00000000000d"}', true);
  update public.referent set telephone = '06 99 99 99 99' where bubble_id = 'ref-0012-elsa';
  get diagnostics touche = row_count;
  if touche <> 0 then
    raise exception 'ÉCHEC — un référent a modifié la fiche d''un autre';
  end if;
  raise notice '  ok — la policy ne lui donne aucune ligne à écrire';
end
$$;

-- ---------------------------------------------------------------------------
\echo '— une administratrice, oui'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"eeeeeeee-0000-0000-0000-00000000000a"}';

  update public.referent set telephone = '05 56 00 00 00' where bubble_id = 'ref-0012-elsa';
  select public.verifier(
    (select telephone from public.referent where bubble_id = 'ref-0012-elsa') = '05 56 00 00 00',
    'elle corrige le téléphone d''Elsa');

  select public.verifier(
    (select count(*) from public.annuaire_referents()) >= 4,
    'et son annuaire couvre les deux loges');
commit;

-- ---------------------------------------------------------------------------
\echo '— mais jamais le rattachement au compte, ni la trace de la reprise'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"eeeeeeee-0000-0000-0000-00000000000a"}', true);
  begin
    update public.referent set profil_id = null where bubble_id = 'ref-0012-elsa';
    raise exception 'ÉCHEC — le rattachement au compte a été détaché';
  exception when insufficient_privilege then
    raise notice '  ok — profil_id n''est pas dans les colonnes accordées';
  end;
end
$$;

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"eeeeeeee-0000-0000-0000-00000000000a"}', true);
  begin
    update public.referent set bubble_id = 'usurpe' where bubble_id = 'ref-0012-elsa';
    raise exception 'ÉCHEC — l''identifiant de reprise a été réécrit';
  exception when insufficient_privilege then
    raise notice '  ok — bubble_id non plus';
  end;
end
$$;

-- ---------------------------------------------------------------------------
\echo '— personne ne cree ni ne supprime un referent'
-- ---------------------------------------------------------------------------
select public.verifier(
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'referent'
      and cmd in ('INSERT', 'DELETE')) = 0,
  'aucune policy de création ni de suppression : un dossier ne perd pas son référent par un clic');

\echo '— et rien de tout cela sans etre connecte'
select public.verifier(
  public.refuse('anon', 'referent'),
  'sans session, la table n''est même pas adressable');

\echo ''
\echo 'Tous les contrôles de 0012_annuaire_referents.sql sont passés.'
