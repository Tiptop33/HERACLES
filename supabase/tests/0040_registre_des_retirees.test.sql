-- Tests de la migration 0040_registre_des_retirees.sql.
--
-- Ce qu'on éprouve : une réunion retirée se retrouve, où qu'elle tombe dans le
-- calendrier — c'est tout l'objet de cette fonction, puisque les deux autres
-- registres la perdaient.
--
--   · Anne  référente à Agen-0040
--   · Kim   référent  à Blaye-0040, une autre loge

\set ON_ERROR_STOP on
\o /dev/null

\set anne 'aaaaaaaa-3333-0000-0000-000000000111'
\set kim  'aaaaaaaa-3333-0000-0000-000000000112'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'anne', 'anne0040@example.org', '{"role":"referent","nom":"Anne","prenom":"A"}'),
  (:'kim',  'kim0040@example.org',  '{"role":"referent","nom":"Kim","prenom":"K"}');

insert into public.loge (bubble_id, nom) values
  ('loge-0040-agen',  'Agen — 0040'),
  ('loge-0040-blaye', 'Blaye — 0040')
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, email, loge_id) values
  ('ref-0040-anne', :'anne', 'Anne', 'A', 'anne0040@example.org',
   (select id from public.loge where bubble_id = 'loge-0040-agen')),
  ('ref-0040-kim',  :'kim',  'Kim',  'K', 'kim0040@example.org',
   (select id from public.loge where bubble_id = 'loge-0040-blaye'))
on conflict do nothing;

select id as r_anne from public.referent where bubble_id = 'ref-0040-anne' \gset

-- L'exercice réel au 9 août 2026 : terminé depuis le 31 juillet.
insert into public.parametre (id, date_depart, date_fin)
values (true, '2025-09-01', '2026-07-31')
on conflict (id) do update set date_depart = excluded.date_depart,
                               date_fin    = excluded.date_fin;

-- ---------------------------------------------------------------------------
\echo '— rien de retire, rien a montrer'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000111"}';

  select public.ouvrir_une_reunion(date '2026-02-10', 'Temple') as dedans \gset
  select public.ouvrir_une_reunion(date '2026-08-09') as dehors \gset

  select public.verifier(
    (select count(*) from public.registre_des_retirees()) = 0,
    'aucune réunion retirée, la liste est vide');
commit;

-- ---------------------------------------------------------------------------
\echo '— une retiree se retrouve, dans l exercice comme dehors'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000111"}';

  select public.retirer_une_reunion(:'dedans'::uuid);

  select public.verifier(
    (select count(*) from public.registre_des_retirees()) = 1
      and (select id from public.registre_des_retirees()) = :'dedans'::uuid,
    'celle de février se retrouve après son retrait');

  -- Le cas que les deux autres registres perdaient : retirée ET hors bornes.
  -- Avant 0040, plus rien ne la montrait nulle part.
  select public.retirer_une_reunion(:'dehors'::uuid);

  select public.verifier(
    (select count(*) from public.registre_des_retirees()) = 2,
    'et celle d''août aussi, bien qu''elle tombe hors de l''exercice');

  select public.verifier(
    (select hors_exercice from public.registre_des_retirees()
      where id = :'dehors'::uuid),
    'elle se sait hors exercice — rendue, elle ne compterait toujours pas');

  select public.verifier(
    (select hors_exercice from public.registre_des_retirees()
      where id = :'dedans'::uuid) = false,
    'celle de février, elle, reviendrait aux compteurs');
commit;

-- ---------------------------------------------------------------------------
\echo '— la derniere retiree passe en tete'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000111"}';

  -- C'est presque toujours celle qu'on vient de retirer par erreur qu'on
  -- cherche : l'ordre suit le retrait, pas la date de la réunion.
  select public.verifier(
    (select id from public.registre_des_retirees() limit 1) = :'dehors'::uuid,
    'la dernière retirée est en haut de la liste');

  -- Le jour du retrait, en heure de Paris : un retrait fait après 22 h se
  -- lirait la veille si la conversion était laissée à l'affichage.
  select public.verifier(
    (select retire_le from public.registre_des_retirees()
      where id = :'dehors'::uuid)
      = (now() at time zone 'Europe/Paris')::date,
    'et la liste dit quand le retrait a eu lieu, à la date de Paris');

  select public.verifier(
    (select retire_par_nom from public.registre_des_retirees()
      where id = :'dehors'::uuid) = 'A Anne',
    'et par qui');
commit;

-- ---------------------------------------------------------------------------
\echo '— rendue, elle quitte cette liste et revient a l autre'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000111"}';

  select public.rendre_une_reunion(:'dedans'::uuid);

  select public.verifier(
    (select count(*) from public.registre_des_retirees()) = 1,
    'rendue, elle n''est plus dans les retirées');

  select public.verifier(
    (select count(*) from public.registre_des_reunions()) = 1,
    'et elle est revenue au registre de l''exercice');
commit;

-- ---------------------------------------------------------------------------
\echo '— les comptes sont ceux de la reunion, pas ceux de l exercice'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000111"}';

  -- On pointe **avant** de retirer : une réunion retirée ne se pointe plus,
  -- `puis_je_tenir_cette_reunion()` l'exclut (0036). C'est justement pour
  -- cela que la liste doit dire ce qu'elle porte — on ne peut plus l'ouvrir
  -- pour aller voir.
  select public.ouvrir_une_reunion(date '2026-05-20', 'Salle basse') as mai \gset
  select public.pointer_a_l_appel(:'mai'::uuid, :'r_anne'::uuid, 'Présent');
  select public.retirer_une_reunion(:'mai'::uuid);

  select public.verifier(
    (select presents from public.registre_des_retirees()
      where id = :'mai'::uuid) = 1
      and (select effectif from public.registre_des_retirees()
            where id = :'mai'::uuid) = 1,
    'la liste dit ce qui reviendrait aux compteurs si on la rendait');

  -- Et le registre de l'exercice, lui, ne la compte plus.
  select public.verifier(
    (select count(*) from public.registre_des_reunions()
      where id = :'mai'::uuid) = 0,
    'tandis que le registre de l''exercice l''a bien perdue');
commit;

-- ---------------------------------------------------------------------------
\echo '— et une autre loge n y lit rien'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000112"}';

  select public.verifier(
    (select count(*) from public.registre_des_retirees()) = 0,
    'Blaye ne voit pas les retirées d''Agen');
commit;

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-000000000000"}', true);
  if (select count(*) from public.registre_des_retirees()) > 0 then
    raise exception 'ÉCHEC — les retirées se lisent sans loge';
  end if;
  raise notice '  ok — sans loge, aucune retirée';
end
$$;

\echo ''
\echo 'Tous les contrôles de 0040_registre_des_retirees.sql sont passés.'
