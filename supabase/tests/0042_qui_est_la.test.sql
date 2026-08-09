-- Tests de la migration 0042_qui_est_la.sql.
--
--   · Ana   référente à Tours-0042, celle qui regarde la colonne
--   · Bruno référent  à Tours-0042
--   · Cléo  référente à Tours-0042
--   · Dan   référent  à Blois-0042, une autre loge

\set ON_ERROR_STOP on
\o /dev/null

\set ana   'aaaaaaaa-3333-0000-0000-000000000131'
\set bruno 'aaaaaaaa-3333-0000-0000-000000000132'
\set cleo  'aaaaaaaa-3333-0000-0000-000000000133'
\set dan   'aaaaaaaa-3333-0000-0000-000000000134'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'ana',   'ana0042@example.org',   '{"role":"referent"}'),
  (:'bruno', 'bruno0042@example.org', '{"role":"referent"}'),
  (:'cleo',  'cleo0042@example.org',  '{"role":"referent"}'),
  (:'dan',   'dan0042@example.org',   '{"role":"referent"}');

insert into public.loge (bubble_id, nom) values
  ('loge-0042-tours', 'Tours — 0042'),
  ('loge-0042-blois', 'Blois — 0042')
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, email, loge_id) values
  ('ref-0042-ana',   :'ana',   'Ana',   'A', 'ana0042@example.org',
   (select id from public.loge where bubble_id = 'loge-0042-tours')),
  ('ref-0042-bruno', :'bruno', 'Bruno', 'B', 'bruno0042@example.org',
   (select id from public.loge where bubble_id = 'loge-0042-tours')),
  ('ref-0042-cleo',  :'cleo',  'Cléo',  'C', 'cleo0042@example.org',
   (select id from public.loge where bubble_id = 'loge-0042-tours')),
  ('ref-0042-dan',   :'dan',   'Dan',   'D', 'dan0042@example.org',
   (select id from public.loge where bubble_id = 'loge-0042-blois'))
on conflict do nothing;

select id as r_bruno from public.referent where bubble_id = 'ref-0042-bruno' \gset

-- ---------------------------------------------------------------------------
\echo '— personne n est la tant que personne ne s est connecte'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000131"}';
  select public.verifier(
    (select count(*) from public.les_connectes()) = 0,
    'la colonne est vide au départ');
commit;

-- ---------------------------------------------------------------------------
\echo '— se connecter met dans la liste des autres'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000132"}';
  select public.je_me_connecte();
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000131"}';
  select public.verifier(
    (select count(*) from public.les_connectes()) = 1
      and (select referent_id from public.les_connectes()) = :'r_bruno'::uuid,
    'Ana voit Bruno');

  select public.verifier(
    (select nom from public.les_connectes()) = 'Bruno',
    'avec son nom, de quoi remplir la vignette au survol');
commit;

-- ---------------------------------------------------------------------------
\echo '— on ne se voit pas soi meme'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000132"}';
  -- Bruno est connecté, mais son nom est déjà au-dessus dans la colonne.
  select public.verifier(
    (select count(*) from public.les_connectes()) = 0,
    'Bruno ne se voit pas lui-même');
commit;

-- ---------------------------------------------------------------------------
\echo '— se reconnecter ne decale pas l heure de debut'
-- ---------------------------------------------------------------------------
select connecte_depuis as debut_bruno from public.profil
 where id = 'aaaaaaaa-3333-0000-0000-000000000132' \gset

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000132"}';
  select public.je_me_connecte();
commit;

select public.verifier(
  (select connecte_depuis from public.profil
    where id = 'aaaaaaaa-3333-0000-0000-000000000132') = :'debut_bruno'::timestamptz,
  'un second onglet ne remet pas le compteur à zéro');

-- ---------------------------------------------------------------------------
\echo '— une session de plus de douze heures est reputee close'
-- ---------------------------------------------------------------------------
-- L'onglet oublié : sans ce garde-fou, la liste finirait par afficher tous
-- ceux qui se sont connectés un jour.
update public.profil set connecte_depuis = now() - interval '13 hours'
 where id = 'aaaaaaaa-3333-0000-0000-000000000132';

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000131"}';
  select public.verifier(
    (select count(*) from public.les_connectes()) = 0,
    'l''onglet oublié depuis treize heures ne compte plus');
commit;

update public.profil set connecte_depuis = now() - interval '11 hours'
 where id = 'aaaaaaaa-3333-0000-0000-000000000132';

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000131"}';
  select public.verifier(
    (select count(*) from public.les_connectes()) = 1,
    'onze heures, en revanche, c''est encore une journée de travail');
commit;

-- ---------------------------------------------------------------------------
\echo '— se deconnecter sort de la liste'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000132"}';
  select public.je_me_deconnecte();
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000131"}';
  select public.verifier(
    (select count(*) from public.les_connectes()) = 0,
    'Bruno déconnecté, la colonne d''Ana est vide');
commit;

-- ---------------------------------------------------------------------------
\echo '— la liste ne sort pas de la loge'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000134"}';
  select public.je_me_connecte();
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000133"}';
  select public.je_me_connecte();
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000131"}';
  -- Dan est connecté, mais à Blois. Savoir qui travaille dans une autre loge
  -- ne regarde personne.
  select public.verifier(
    (select count(*) from public.les_connectes()) = 1,
    'Ana voit Cléo, et pas Dan qui est d''une autre loge');
commit;

-- ---------------------------------------------------------------------------
\echo '— sans loge, aucune liste'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-000000000000"}', true);
  if (select count(*) from public.les_connectes()) > 0 then
    raise exception 'ÉCHEC — la liste se lit sans loge';
  end if;
  raise notice '  ok — sans loge, personne';
end
$$;

-- ---------------------------------------------------------------------------
\echo '— la colonne reste fermee en direct'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"aaaaaaaa-3333-0000-0000-000000000131"}', true);
  begin
    -- La RLS de `profil` ne laisse lire que sa propre ligne : la présence des
    -- autres ne se lit que par la fonction, qui filtre sur la loge.
    if (select count(*) from public.profil where connecte_depuis is not null) > 1 then
      raise exception 'ÉCHEC — la présence des autres se lit en direct';
    end if;
    raise notice '  ok — la présence ne se lit que par la fonction';
  end;
end
$$;

\echo ''
\echo 'Tous les contrôles de 0042_qui_est_la.sql sont passés.'
