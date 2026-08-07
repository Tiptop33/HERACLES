-- Tests de la migration 0013_annuaire_ma_loge.sql.
--
-- Une seule question ici : l'annuaire sait-il reconnaître la fiche de la
-- personne qui le consulte ? C'est de cette fiche que la page tire la loge sur
-- laquelle s'ouvrir. Si elle se trompe, un administrateur atterrit dans la
-- mauvaise loge — ou dans aucune.
--
-- Trois personnes, deux loges :
--   · Hugo    référent à Lyon-0013
--   · Iris    administratrice, ET référente à Lyon-0013 — elle voit les deux
--             loges, mais la page doit s'ouvrir sur la sienne
--   · Jean    référent à Nantes-0013
--   · Karine  administratrice sans fiche de référent — aucune loge à deviner

\set ON_ERROR_STOP on
\o /dev/null

\set hugo   'ffffffff-0000-0000-0000-000000000013'
\set iris   'ffffffff-0000-0000-0000-000000000014'
\set jean   'ffffffff-0000-0000-0000-000000000015'
\set karine 'ffffffff-0000-0000-0000-000000000016'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'hugo',   'hugo@example.org',   '{"role":"referent","nom":"Pratt","prenom":"Hugo"}'),
  (:'iris',   'iris@example.org',   '{"role":"referent","nom":"Murdoch","prenom":"Iris"}'),
  (:'jean',   'jean@example.org',   '{"role":"referent","nom":"Vigo","prenom":"Jean"}'),
  (:'karine', 'karine@example.org', '{"role":"referent","nom":"Silla","prenom":"Karine"}');
update public.profil set role = 'admin' where id in (:'iris', :'karine');

insert into public.loge (bubble_id, nom) values
  ('loge-0013-lyon',   'Lyon — 0013'),
  ('loge-0013-nantes', 'Nantes — 0013')
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, email, loge_id) values
  ('ref-0013-hugo', :'hugo', 'Pratt',   'Hugo', 'hugo@example.org',
   (select id from public.loge where bubble_id = 'loge-0013-lyon')),
  ('ref-0013-iris', :'iris', 'Murdoch', 'Iris', 'iris@example.org',
   (select id from public.loge where bubble_id = 'loge-0013-lyon')),
  ('ref-0013-jean', :'jean', 'Vigo',    'Jean', 'jean@example.org',
   (select id from public.loge where bubble_id = 'loge-0013-nantes')),
  -- Une fiche sans compte, dans la même loge que Hugo : `c_est_moi` doit y
  -- valoir `false`, et non `null`.
  ('ref-0013-sans', null,    'Sansnom', 'Sonia', 'sonia0013@example.org',
   (select id from public.loge where bubble_id = 'loge-0013-lyon')),
  -- Et une sans loge du tout : celles que la reprise Bubble a laissées
  -- orphelines. Seul un administrateur les voit.
  ('ref-0013-orphelin', null, 'Orphelin', 'Odile', 'odile0013@example.org', null)
on conflict do nothing;

-- ---------------------------------------------------------------------------
\echo '— chacun reconnait sa propre fiche, et une seule'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ffffffff-0000-0000-0000-000000000013"}';

  select public.verifier(
    (select count(*) from public.annuaire_referents() where c_est_moi) = 1,
    'Hugo a exactement une fiche marquée « c''est moi »');

  select public.verifier(
    (select nom from public.annuaire_referents() where c_est_moi) = 'Pratt',
    'et c''est la sienne');

  select public.verifier(
    (select loge_nom from public.annuaire_referents() where c_est_moi) = 'Lyon — 0013',
    'la page y lit sa loge : Lyon');
commit;

-- ---------------------------------------------------------------------------
\echo '— une fiche sans compte n est marquee ni vrai ni null'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ffffffff-0000-0000-0000-000000000013"}';

  select public.verifier(
    (select c_est_moi from public.annuaire_referents() where nom = 'Sansnom') = false,
    'Sonia n''a pas de compte : « c''est moi » vaut faux, pas « on ne sait pas »');

  select public.verifier(
    (select count(*) from public.annuaire_referents() where c_est_moi is null) = 0,
    'aucune fiche ne laisse la question en suspens');
commit;

-- ---------------------------------------------------------------------------
\echo '— une administratrice rattachee a une loge la retrouve'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ffffffff-0000-0000-0000-000000000014"}';

  select public.verifier(
    (select count(*) from public.annuaire_referents() where nom = 'Vigo') = 1,
    'Iris voit Nantes — son rôle ne se réduit pas à sa loge');

  select public.verifier(
    (select loge_nom from public.annuaire_referents() where c_est_moi) = 'Lyon — 0013',
    'mais la page s''ouvrira sur Lyon, la sienne');
commit;

-- ---------------------------------------------------------------------------
\echo '— une administratrice sans fiche n a pas de loge a deviner'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ffffffff-0000-0000-0000-000000000016"}';

  select public.verifier(
    (select count(*) from public.annuaire_referents() where c_est_moi) = 0,
    'Karine n''a pas de fiche : aucune loge par défaut, la page les montre toutes');

  select public.verifier(
    (select count(*) from public.annuaire_referents()
      where nom = 'Orphelin') = 1,
    'et elle voit les fiches sans loge — celles qu''il reste à rattacher');
commit;

-- ---------------------------------------------------------------------------
\echo '— un referent ne voit toujours pas au dela de sa loge'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ffffffff-0000-0000-0000-000000000013"}';

  select public.verifier(
    (select count(*) from public.annuaire_referents() where nom in ('Vigo', 'Orphelin')) = 0,
    'ni Nantes, ni les fiches sans loge : 0013 n''élargit rien');
commit;

-- ---------------------------------------------------------------------------
\echo '— et rien de tout cela sans etre connecte'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role anon;
  begin
    perform public.annuaire_referents();
    raise exception 'ÉCHEC — l''annuaire répond sans session';
  exception when insufficient_privilege then
    raise notice '  ok — anon n''a pas le droit d''appeler la fonction';
  end;
end
$$;

\echo ''
\echo 'Tous les contrôles de 0013_annuaire_ma_loge.sql sont passés.'
