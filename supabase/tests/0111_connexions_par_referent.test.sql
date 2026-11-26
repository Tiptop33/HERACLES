-- Tests de la migration 0111_connexions_par_referent.sql.
--
--   · Chef   administrateur, celui qui filtre
--   · Lina   référente à Auch-0111, deux connexions
--   · Marc   référent  à Auch-0111, une connexion
--   · Noé    référent  à Auch-0111, jamais connecté

\set ON_ERROR_STOP on
\o /dev/null

\set chef 'aaaaaaaa-0111-0000-0000-000000000001'
\set lina 'aaaaaaaa-0111-0000-0000-000000000002'
\set marc 'aaaaaaaa-0111-0000-0000-000000000003'
\set noe  'aaaaaaaa-0111-0000-0000-000000000004'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'chef', 'chef0111@example.org', '{"role":"referent"}'),
  (:'lina', 'lina0111@example.org', '{"role":"referent"}'),
  (:'marc', 'marc0111@example.org', '{"role":"referent"}'),
  (:'noe',  'noe0111@example.org',  '{"role":"referent"}');

update public.profil set role = 'admin' where id = :'chef';

insert into public.loge (bubble_id, nom) values
  ('loge-0111-auch', 'Auch — 0111')
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, email, loge_id) values
  ('ref-0111-lina', :'lina', 'Zzz-Lina', 'L', 'lina0111@example.org',
   (select id from public.loge where bubble_id = 'loge-0111-auch')),
  ('ref-0111-marc', :'marc', 'Zzz-Marc', 'M', 'marc0111@example.org',
   (select id from public.loge where bubble_id = 'loge-0111-auch')),
  ('ref-0111-noe', :'noe', 'Zzz-Noe', 'N', 'noe0111@example.org',
   (select id from public.loge where bubble_id = 'loge-0111-auch'))
on conflict do nothing;

select id as lina_ref from public.referent where bubble_id = 'ref-0111-lina' \gset
select id as marc_ref from public.referent where bubble_id = 'ref-0111-marc' \gset
select id as noe_ref  from public.referent where bubble_id = 'ref-0111-noe'  \gset

-- Lina : une connexion ancienne, close par le silence, puis une neuve.
insert into public.connexion_referent (referent_id, debut, dernier_signe) values
  (:'lina_ref', now() - interval '3 months', now() - interval '3 months' + interval '20 minutes');

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0111-0000-0000-000000000002"}';
  select public.je_me_connecte();
commit;
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0111-0000-0000-000000000003"}';
  select public.je_me_connecte();
commit;

-- ---------------------------------------------------------------------------
\echo '— l ancienne forme a un parametre n existe plus'
-- ---------------------------------------------------------------------------
select public.verifier(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'les_connexions_des_referents') = 1,
  'une seule fonction de ce nom : l appel n est pas ambigu');

-- ---------------------------------------------------------------------------
\echo '— l administrateur filtre sur un referent'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0111-0000-0000-000000000001"}';
  select public.verifier(
    (select count(*) from public.les_connexions_des_referents(500, :'lina_ref')) = 2,
    'les deux connexions de Lina');
  select public.verifier(
    (select bool_and(referent_id = :'lina_ref')
       from public.les_connexions_des_referents(500, :'lina_ref')),
    'et rien que les siennes');
  select public.verifier(
    (select count(*) from public.les_connexions_des_referents(500, :'marc_ref')) = 1,
    'celle de Marc');
  select public.verifier(
    (select count(*) from public.les_connexions_des_referents(500, :'noe_ref')) = 0,
    'aucune pour Noe, jamais connecte');
  -- Le filtre passe avant la limite : la connexion vieille de trois mois
  -- reste atteignable, même avec une limite qui l'aurait écartée du tout.
  select public.verifier(
    (select count(*) from public.les_connexions_des_referents(2, :'lina_ref')
      where debut < now() - interval '2 months') = 1,
    'la connexion ancienne de Lina se retrouve');
commit;

-- ---------------------------------------------------------------------------
\echo '— sans referent, tout le journal, comme avant'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0111-0000-0000-000000000001"}';
  select public.verifier(
    (select count(*) from public.les_connexions_des_referents()
      where referent_id in (:'lina_ref', :'marc_ref')) = 3,
    'les trois connexions de la loge');
  select public.verifier(
    (select count(*) from public.les_connexions_des_referents(500, null)
      where referent_id in (:'lina_ref', :'marc_ref')) = 3,
    'et pareil avec un referent nul');
commit;

-- ---------------------------------------------------------------------------
\echo '— le menu : ceux qui ont une connexion, par nom'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0111-0000-0000-000000000001"}';
  select public.verifier(
    (select array_agg(nom order by rang)
       from (select nom, row_number() over () as rang
               from public.les_referents_du_journal()
              where nom like 'Zzz-%') t) = array['Zzz-Lina', 'Zzz-Marc'],
    'Lina puis Marc, sans Noe');
  select public.verifier(
    (select count(*) from public.les_referents_du_journal()
      where referent_id = :'lina_ref' and loge_nom = 'Auch — 0111') = 1,
    'une ligne par referent, avec sa loge');
commit;

-- ---------------------------------------------------------------------------
\echo '— un referent n obtient rien, filtre ou non'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0111-0000-0000-000000000002"}';
  select public.verifier(
    (select count(*) from public.les_connexions_des_referents(500, :'lina_ref')) = 0,
    'Lina ne lit pas ses propres connexions');
  select public.verifier(
    (select count(*) from public.les_connexions_des_referents(500, :'marc_ref')) = 0,
    'ni celles de Marc');
  select public.verifier(
    (select count(*) from public.les_referents_du_journal()) = 0,
    'et le menu est vide pour elle');
commit;

begin;
  set local role anon;
  do $$
  begin
    perform count(*) from public.les_referents_du_journal();
    raise exception 'ÉCHEC — un anonyme appelle les_referents_du_journal()';
  exception when insufficient_privilege then
    null;
  end
  $$;
commit;
