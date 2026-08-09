-- Tests de la migration 0044_regler_l_exercice.sql.
--
--   · Zoé   administratrice
--   · Yann  référent — il lit les dates, il ne les change pas

\set ON_ERROR_STOP on
\o /dev/null

\set zoe  'aaaaaaaa-3333-0000-0000-000000000141'
\set yann 'aaaaaaaa-3333-0000-0000-000000000142'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'zoe',  'zoe0044@example.org',  '{"role":"admin"}'),
  (:'yann', 'yann0044@example.org', '{"role":"referent"}');

update public.profil set role = 'admin' where id = :'zoe';

-- ---------------------------------------------------------------------------
\echo '— les dates se lisent'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000142"}';

  select public.verifier(
    (select debut from public.l_exercice()) = date '2025-09-01'
      and (select fin from public.l_exercice()) = date '2026-08-31',
    'un référent lit les bornes de l''exercice');
commit;

-- ---------------------------------------------------------------------------
\echo '— seul l administrateur les regle'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"aaaaaaaa-3333-0000-0000-000000000142"}', true);
  begin
    perform public.regler_l_exercice(date '2000-01-01', date '2000-12-31');
    raise exception 'ÉCHEC — un référent a réglé l''exercice';
  exception when insufficient_privilege then
    raise notice '  ok — un référent ne règle pas l''exercice';
  end;
end
$$;

select public.verifier(
  (select date_fin::date from public.parametre where id) = date '2026-08-31',
  'et les dates n''ont pas bougé');

-- ---------------------------------------------------------------------------
\echo '— l administrateur les regle, et l ordre est verifie'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000141"}';

  -- Une fin qui précède le début mettrait tous les compteurs à zéro sans que
  -- rien ne le signale. On refuse plutôt que de laisser faire.
  select public.verifier(
    public.regler_l_exercice(date '2027-09-01', date '2026-08-31') = 'ordre',
    'une fin qui précède le début est refusée');

  select public.verifier(
    public.regler_l_exercice(date '2026-08-31', date '2026-08-31') = 'ordre',
    'et un exercice d''un jour nul aussi');

  select public.verifier(
    public.regler_l_exercice(date '2026-09-01', date '2027-08-31') = 'regle',
    'l''exercice suivant se pose');

  select public.verifier(
    (select fin from public.l_exercice()) = date '2027-08-31',
    'et se relit aussitôt');
commit;

-- ---------------------------------------------------------------------------
\echo '— regler l exercice deplace ce que le registre compte'
-- ---------------------------------------------------------------------------
-- C'est tout l'objet de ces deux dates : elles commandent l'assiduité.
insert into public.loge (bubble_id, nom) values ('loge-0044', 'Metz — 0044')
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, email, loge_id) values
  ('ref-0044-yann', :'yann', 'Yann', 'Y', 'yann0044@example.org',
   (select id from public.loge where bubble_id = 'loge-0044'))
on conflict do nothing;

select id as r_yann from public.referent where bubble_id = 'ref-0044-yann' \gset

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000142"}';

  -- Une réunion en novembre 2026 : dans l'exercice qu'on vient de poser.
  select public.ouvrir_une_reunion(date '2026-11-12') as novembre \gset
  select public.pointer_a_l_appel(:'novembre'::uuid, :'r_yann'::uuid, 'Présent');

  select public.verifier(
    (select count(*) from public.registre_des_reunions()
      where id = :'novembre'::uuid) = 1,
    'elle figure au registre de l''exercice 2026-2027');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000141"}';
  -- On revient à l'exercice précédent : la même réunion en sort.
  select public.regler_l_exercice(date '2025-09-01', date '2026-08-31');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000142"}';

  select public.verifier(
    (select count(*) from public.registre_des_reunions()
      where id = :'novembre'::uuid) = 0,
    'et elle en sort dès qu''on ramène les bornes en arrière');

  -- Sa feuille, elle, ne bouge pas : depuis 0045 elle ne compte qu'elle-même,
  -- et les dates d'exercice ne la commandent plus.
  select public.verifier(
    (select presences from public.feuille_d_appel(:'novembre'::uuid)
      where referent_id = :'r_yann'::uuid) = 1,
    'sa feuille garde sa présence — l''exercice ne commande que le registre');

  select public.verifier(
    (select count(*) from public.registre_hors_exercice()
      where id = :'novembre'::uuid) = 1,
    'et se retrouve dans celui de l''exercice passé');
commit;

\echo ''
\echo 'Tous les contrôles de 0044_regler_l_exercice.sql sont passés.'
