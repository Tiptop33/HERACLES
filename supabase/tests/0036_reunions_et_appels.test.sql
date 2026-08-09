-- Tests de la migration 0036_reunions_et_appels.sql.
--
--   · Iris   référente à Nîmes-0036
--   · Jonas  référent à Nîmes-0036
--   · Kenza  référente à Rodez-0036 — Nîmes ne la regarde pas
--   · Lucas  administrateur, sans fiche de référent

\set ON_ERROR_STOP on
\o /dev/null

\set iris  'aaaaaaaa-3333-0000-0000-000000000071'
\set jonas 'aaaaaaaa-3333-0000-0000-000000000072'
\set kenza 'aaaaaaaa-3333-0000-0000-000000000073'
\set lucas 'aaaaaaaa-3333-0000-0000-000000000074'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'iris',  'iris0036@example.org',  '{"role":"referent","nom":"Iris","prenom":"I"}'),
  (:'jonas', 'jonas0036@example.org', '{"role":"referent","nom":"Jonas","prenom":"J"}'),
  (:'kenza', 'kenza0036@example.org', '{"role":"referent","nom":"Kenza","prenom":"K"}'),
  (:'lucas', 'lucas0036@example.org', '{"role":"referent","nom":"Lucas","prenom":"L"}');
update public.profil set role = 'admin' where id = :'lucas';

insert into public.loge (bubble_id, nom) values
  ('loge-0036-nimes', 'Nîmes — 0036'),
  ('loge-0036-rodez', 'Rodez — 0036')
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, email, loge_id) values
  ('ref-0036-iris',  :'iris',  'Iris',  'I', 'iris0036@example.org',
   (select id from public.loge where bubble_id = 'loge-0036-nimes')),
  ('ref-0036-jonas', :'jonas', 'Jonas', 'J', 'jonas0036@example.org',
   (select id from public.loge where bubble_id = 'loge-0036-nimes')),
  ('ref-0036-kenza', :'kenza', 'Kenza', 'K', 'kenza0036@example.org',
   (select id from public.loge where bubble_id = 'loge-0036-rodez'))
on conflict do nothing;

select id as r_iris  from public.referent where bubble_id = 'ref-0036-iris'  \gset
select id as r_jonas from public.referent where bubble_id = 'ref-0036-jonas' \gset
select id as r_kenza from public.referent where bubble_id = 'ref-0036-kenza' \gset

-- L'exercice, sans lequel les compteurs n'ont pas de bornes.
insert into public.parametre (id, date_depart, date_fin)
values (true, '2026-01-01', '2026-12-31')
on conflict (id) do update set date_depart = excluded.date_depart,
                               date_fin    = excluded.date_fin;

-- ---------------------------------------------------------------------------
\echo '— ouvrir une reunion, et la rouvrir sans la dedoubler'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000071"}';

  select public.ouvrir_une_reunion(date '2026-03-05', 'Temple') as reunion \gset

  -- Deux personnes qui ouvrent la même soirée doivent tenir la même feuille.
  select public.verifier(
    public.ouvrir_une_reunion(date '2026-03-05') = :'reunion'::uuid,
    'la rouvrir rend la même, elle ne la dédouble pas');
commit;

select public.verifier(
  (select count(*) from public.reunion where tenue_le = date '2026-03-05') = 1,
  'Iris ouvre la réunion du 5 mars, et une seule');

select set_config('essai.reunion', :'reunion', false);

-- ---------------------------------------------------------------------------
\echo '— la feuille d appel montre toute la loge, et personne d autre'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000071"}';

  select public.verifier(
    (select count(*) from public.feuille_d_appel(:'reunion'::uuid)) = 2,
    'la feuille porte les deux référents de Nîmes');

  select public.verifier(
    (select count(*) from public.feuille_d_appel(:'reunion'::uuid)
      where referent_id = :'r_kenza'::uuid) = 0,
    'et pas Kenza, qui siège à Rodez');

  -- Vide, et non « Absent » : tant que personne n'a appelé, on ne sait rien.
  select public.verifier(
    (select bool_and(etat is null) from public.feuille_d_appel(:'reunion'::uuid)),
    'avant l''appel, aucun état — ce n''est pas la même chose qu''absent');
commit;

-- ---------------------------------------------------------------------------
\echo '— pointer, corriger, et ne pas doubler'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000071"}';

  select public.verifier(
    public.pointer_a_l_appel(:'reunion'::uuid, :'r_iris'::uuid, 'Présent')
      and public.pointer_a_l_appel(:'reunion'::uuid, :'r_jonas'::uuid, 'Excusé'),
    'Iris pointe les deux référents');

  -- Jonas arrive finalement : on recoche, on n'ajoute pas une seconde ligne.
  select public.verifier(
    public.pointer_a_l_appel(:'reunion'::uuid, :'r_jonas'::uuid, 'Présent'),
    'et corrige Jonas quand il arrive');

commit;

select public.verifier(
  (select count(*) from public.appel where reunion_id = current_setting('essai.reunion')::uuid) = 2
    and (select etat from public.appel
          where reunion_id = current_setting('essai.reunion')::uuid
            and referent_id = (select id from public.referent where bubble_id = 'ref-0036-jonas'))
        = 'Présent',
  'deux lignes, pas trois — recocher écrase');

-- ---------------------------------------------------------------------------
\echo '— un etat inconnu, et un referent d ailleurs, sont refuses'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"aaaaaaaa-3333-0000-0000-000000000071"}', true);
  begin
    perform public.pointer_a_l_appel(
      current_setting('essai.reunion')::uuid,
      (select id from public.referent where bubble_id = 'ref-0036-iris'),
      'Peut-être');
    raise exception 'ÉCHEC — un état inventé a été accepté';
  exception when check_violation then
    raise notice '  ok — trois états, et pas un de plus';
  end;
end
$$;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000071"}';

  select public.verifier(
    public.pointer_a_l_appel(:'reunion'::uuid, :'r_kenza'::uuid, 'Présent') = false,
    'on n''appelle pas quelqu''un qui ne siège pas dans cette loge');
commit;

-- ---------------------------------------------------------------------------
\echo '— une autre loge ne tient pas ce registre'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000073"}';

  select public.verifier(
    (select count(*) from public.registre_des_reunions()) = 0
      and (select count(*) from public.feuille_d_appel(:'reunion'::uuid)) = 0,
    'Kenza ne voit ni le registre de Nîmes, ni sa feuille d''appel');

  select public.verifier(
    public.pointer_a_l_appel(:'reunion'::uuid, :'r_iris'::uuid, 'Absent') = false,
    'et n''y pointe personne');
commit;

select public.verifier(
  (select etat from public.appel
    where reunion_id = current_setting('essai.reunion')::uuid
      and referent_id = (select id from public.referent where bubble_id = 'ref-0036-iris'))
    = 'Présent',
  'Iris est restée présente — rien n''a bougé');

-- ---------------------------------------------------------------------------
\echo '— l administration sans fiche ne tient rien'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"aaaaaaaa-3333-0000-0000-000000000074"}', true);
  begin
    perform public.ouvrir_une_reunion(current_date);
    raise exception 'ÉCHEC — l''administration a ouvert une réunion';
  exception when insufficient_privilege then
    raise notice '  ok — sans loge, aucun registre';
  end;
end
$$;

-- ---------------------------------------------------------------------------
\echo '— le registre compte, et l assiduite suit l exercice'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000071"}';

  select presents, excuses, absents, effectif
    from public.registre_des_reunions() where tenue_le = date '2026-03-05' \gset

  select public.verifier(
    :presents = 2 and :excuses = 0 and :absents = 0 and :effectif = 2,
    'deux présents sur deux — le registre compte juste');

  select public.verifier(
    (select presences from public.feuille_d_appel(:'reunion'::uuid)
      where referent_id = :'r_iris'::uuid) = 1,
    'et l''assiduité d''Iris est à une présence');
commit;

-- Une réunion hors exercice ne compte pas : c'est tout l'objet des bornes.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000071"}';

  select public.ouvrir_une_reunion(date '2025-06-10') as vieille \gset
  select public.pointer_a_l_appel(:'vieille'::uuid, :'r_iris'::uuid, 'Présent');

  select public.verifier(
    (select count(*) from public.registre_des_reunions() where tenue_le = date '2025-06-10') = 0,
    'la réunion de juin 2025 est hors de l''exercice : le registre l''ignore');

  select public.verifier(
    (select presences from public.feuille_d_appel(:'reunion'::uuid)
      where referent_id = :'r_iris'::uuid) = 1,
    'et elle ne gonfle pas l''assiduité de l''exercice');
commit;

-- ---------------------------------------------------------------------------
\echo '— retirer une reunion n efface pas son appel'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000072"}';

  -- Jonas retire la réunion qu'Iris avait ouverte : le registre n'appartient
  -- à personne.
  select public.verifier(
    public.retirer_une_reunion(:'reunion'::uuid),
    'Jonas retire une réunion ouverte par Iris');

  select public.verifier(
    (select count(*) from public.registre_des_reunions()) = 0,
    'elle quitte le registre');
commit;

select public.verifier(
  (select count(*) from public.appel
    where reunion_id = current_setting('essai.reunion')::uuid) = 2,
  'mais ses deux lignes d''appel sont toujours en base');

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000071"}';

  select public.verifier(
    (select retire_par_nom from public.registre_des_reunions(true)
      where id = :'reunion'::uuid) = 'J Jonas',
    'et le registre complet dit qui l''a retirée');

  -- Deux instructions et non une : dans un `and`, rien ne garantit que le
  -- comptage soit évalué après le geste.
  select public.verifier(
    public.rendre_une_reunion(:'reunion'::uuid),
    'Iris la rend');

  select public.verifier(
    (select count(*) from public.registre_des_reunions()) = 1
      and (select presents from public.registre_des_reunions()
            where id = :'reunion'::uuid) = 2,
    'et elle revient au registre avec ses deux présents');
commit;

-- ---------------------------------------------------------------------------
\echo '— une loge ne tient pas deux reunions le meme jour'
-- ---------------------------------------------------------------------------
do $$
declare
  la_loge uuid := (select id from public.loge where bubble_id = 'loge-0036-nimes');
begin
  begin
    insert into public.reunion (loge_id, tenue_le) values (la_loge, date '2026-03-05');
    raise exception 'ÉCHEC — deux réunions le même jour';
  exception when unique_violation then
    raise notice '  ok — un double-clic ne fait pas deux réunions';
  end;
end
$$;

-- ---------------------------------------------------------------------------
\echo '— et les tables restent fermees en direct'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"aaaaaaaa-3333-0000-0000-000000000071"}', true);
  begin
    perform count(*) from public.appel;
    raise exception 'ÉCHEC — un référent lit la table d''appel en direct';
  exception when insufficient_privilege then
    raise notice '  ok — tout passe par les fonctions, comme le suivi';
  end;
end
$$;

\echo ''
\echo 'Tous les contrôles de 0036_reunions_et_appels.sql sont passés.'
