-- Tests de la migration 0041_effacer_une_reunion.sql.
--
-- Trois barrières à éprouver, et une cascade :
--
--   · Hugo   Secrétaire à Metz-0041      — peut effacer
--   · Lise   sans titre à Metz-0041      — ne peut pas
--   · Otto   Vénérable  à Nancy-0041     — peut effacer, mais pas chez Hugo

\set ON_ERROR_STOP on
\o /dev/null

\set hugo 'aaaaaaaa-3333-0000-0000-000000000121'
\set lise 'aaaaaaaa-3333-0000-0000-000000000122'
\set otto 'aaaaaaaa-3333-0000-0000-000000000123'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'hugo', 'hugo0041@example.org', '{"role":"referent","nom":"Hugo","prenom":"H"}'),
  (:'lise', 'lise0041@example.org', '{"role":"referent","nom":"Lise","prenom":"L"}'),
  (:'otto', 'otto0041@example.org', '{"role":"referent","nom":"Otto","prenom":"O"}');

insert into public.loge (bubble_id, nom) values
  ('loge-0041-metz',  'Metz — 0041'),
  ('loge-0041-nancy', 'Nancy — 0041')
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, email, college, loge_id) values
  ('ref-0041-hugo', :'hugo', 'Hugo', 'H', 'hugo0041@example.org', 'Secrétaire',
   (select id from public.loge where bubble_id = 'loge-0041-metz')),
  -- La casse et les espaces viennent de la reprise Bubble : le titre est du
  -- texte libre, et la comparaison doit tenir malgré cela.
  ('ref-0041-lise', :'lise', 'Lise', 'L', 'lise0041@example.org', 'Trésorier',
   (select id from public.loge where bubble_id = 'loge-0041-metz')),
  ('ref-0041-otto', :'otto', 'Otto', 'O', 'otto0041@example.org', '  vénérable maître ',
   (select id from public.loge where bubble_id = 'loge-0041-nancy'))
on conflict do nothing;

select id as r_hugo from public.referent where bubble_id = 'ref-0041-hugo' \gset

insert into public.parametre (id, date_depart, date_fin)
values (true, current_date - 30, current_date + 30)
on conflict (id) do update set date_depart = excluded.date_depart,
                               date_fin    = excluded.date_fin;

-- ---------------------------------------------------------------------------
\echo '— le droit suit le titre, pas la personne'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000121"}';
  select public.verifier(public.puis_je_effacer_des_reunions(),
    'le Secrétaire peut effacer');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000123"}';
  -- « ␣vénérable maître␣ » : casse et espaces différents du titre en table.
  select public.verifier(public.puis_je_effacer_des_reunions(),
    'le Vénérable aussi, malgré la casse et les espaces du champ libre');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000122"}';
  select public.verifier(public.puis_je_effacer_des_reunions() = false,
    'le Trésorier, non — il retire, il n''efface pas');
commit;

-- Le droit ne tient pas à la liste `college`, que l'administration remanie.
-- 0018 la vide entièrement dans ses propres tests : si le droit y était
-- accroché, il aurait disparu ici sans que personne ne s'en aperçoive.
delete from public.college where lower(btrim(nom)) = 'secrétaire';

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000121"}';
  select public.verifier(public.puis_je_effacer_des_reunions(),
    'et il survit à la suppression du titre dans la liste du collège');
commit;

-- ---------------------------------------------------------------------------
\echo '— effacer emporte les pointages'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000121"}';

  select public.ouvrir_une_reunion(current_date, 'Doublon') as bevue \gset
  select public.pointer_a_l_appel(:'bevue'::uuid, :'r_hugo'::uuid, 'Présent');

  select public.verifier(
    public.effacer_une_reunion(:'bevue'::uuid) = 'effacee',
    'la réunion ouverte par erreur s''efface');

  select public.verifier(
    (select count(*) from public.registre_des_reunions(true)
      where id = :'bevue'::uuid) = 0,
    'elle a quitté le registre, retirées comprises');
commit;

-- Les pointages sont partis avec elle : la cascade de 0036 a joué. Lu hors
-- session, `appel` étant fermée à `authenticated`.
select public.verifier(
  (select count(*) from public.appel where reunion_id = :'bevue'::uuid) = 0,
  'et ses pointages avec elle, par la cascade');

select public.verifier(
  (select count(*) from public.reunion where id = :'bevue'::uuid) = 0,
  'la ligne n''est plus en base — ce n''est pas un retrait déguisé');

-- ---------------------------------------------------------------------------
\echo '— une reunion venue de Bubble ne s efface pas'
-- ---------------------------------------------------------------------------
-- Elle reviendrait au prochain déversement : `on conflict (bubble_id) do
-- update` la recréerait, et personne ne comprendrait pourquoi.
insert into public.reunion (bubble_id, loge_id, tenue_le, ouverte_par)
values ('reunion-bubble-0041',
        (select id from public.loge where bubble_id = 'loge-0041-metz'),
        current_date - 3,
        (select id from public.referent where bubble_id = 'ref-0041-hugo'))
on conflict do nothing;

select id as venue from public.reunion where bubble_id = 'reunion-bubble-0041' \gset

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000121"}';

  select public.verifier(
    public.effacer_une_reunion(:'venue'::uuid) = 'bubble',
    'le Secrétaire ne peut pas effacer une réunion reprise de Bubble');

  select public.verifier(
    (select venue_de_bubble from public.registre_des_reunions()
      where id = :'venue'::uuid),
    'et le registre le dit, pour que l''écran ne propose pas le geste');

  -- Ce qu'on peut faire, en revanche : la retirer. Le retrait survit à la
  -- reprise, l'upsert ne touche pas à `retire_le`.
  select public.retirer_une_reunion(:'venue'::uuid);
  select public.verifier(
    (select retiree from public.registre_des_reunions(true)
      where id = :'venue'::uuid),
    'elle se retire, en revanche — et le retrait, lui, survit à la reprise');
commit;

select public.verifier(
  (select count(*) from public.reunion where id = :'venue'::uuid) = 1,
  'elle est toujours en base, comme il se doit');

-- ---------------------------------------------------------------------------
\echo '— sans le droit, la porte est fermee'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000121"}';
  select public.ouvrir_une_reunion(current_date - 1, 'À garder') as gardee \gset
commit;

select set_config('essai.gardee0041', :'gardee', false);

do $$
begin
  set local role authenticated;
  -- Lise est Trésorière : elle voit la réunion, elle ne l'efface pas.
  perform set_config('request.jwt.claims',
    '{"sub":"aaaaaaaa-3333-0000-0000-000000000122"}', true);
  begin
    perform public.effacer_une_reunion(current_setting('essai.gardee0041')::uuid);
    raise exception 'ÉCHEC — un titre sans droit a effacé une réunion';
  exception when insufficient_privilege then
    raise notice '  ok — sans le titre, l''effacement est refusé';
  end;
end
$$;

-- ---------------------------------------------------------------------------
\echo '— et le droit ne traverse pas les loges'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000123"}';

  -- Otto est Vénérable, mais à Nancy. Le titre donne le geste, la loge donne
  -- la cible : les deux sont nécessaires.
  select public.verifier(
    public.effacer_une_reunion(:'gardee'::uuid) = 'introuvable',
    'le Vénérable de Nancy n''efface pas une réunion de Metz');
commit;

select public.verifier(
  (select count(*) from public.reunion where id = :'gardee'::uuid) = 1,
  'la réunion de Metz est toujours là');

\echo ''
\echo 'Tous les contrôles de 0041_effacer_une_reunion.sql sont passés.'
