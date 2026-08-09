-- Tests de la migration 0038_registre_hors_exercice.sql.
--
-- Trois réunions, une de chaque côté des bornes, pour que le partage entre
-- les deux registres soit vérifié plutôt que supposé.
--
--   · Noé   référent à Albi-0038

\set ON_ERROR_STOP on
\o /dev/null

\set noe 'aaaaaaaa-3333-0000-0000-000000000091'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'noe', 'noe0038@example.org', '{"role":"referent","nom":"Noe","prenom":"N"}');

insert into public.loge (bubble_id, nom) values ('loge-0038-albi', 'Albi — 0038')
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, email, loge_id) values
  ('ref-0038-noe', :'noe', 'Noé', 'N', 'noe0038@example.org',
   (select id from public.loge where bubble_id = 'loge-0038-albi'))
on conflict do nothing;

select id as r_noe from public.referent where bubble_id = 'ref-0038-noe' \gset

-- L'exercice réel au 9 août 2026 : terminé depuis le 31 juillet.
insert into public.parametre (id, date_depart, date_fin)
values (true, '2025-09-01', '2026-07-31')
on conflict (id) do update set date_depart = excluded.date_depart,
                               date_fin    = excluded.date_fin;

-- ---------------------------------------------------------------------------
\echo '— chaque reunion tombe dans un seul des deux registres'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000091"}';

  select public.ouvrir_une_reunion(date '2025-04-15') as avant  \gset
  select public.ouvrir_une_reunion(date '2026-02-10') as dedans \gset
  select public.ouvrir_une_reunion(date '2026-08-09') as apres  \gset

  select public.verifier(
    (select count(*) from public.registre_des_reunions()) = 1
      and (select id from public.registre_des_reunions()) = :'dedans'::uuid,
    'le registre de l''exercice ne montre que celle de février');

  select public.verifier(
    (select count(*) from public.registre_hors_exercice()) = 2,
    'et l''autre registre montre les deux qui débordent');

  -- L'ordre : la plus récente d'abord, comme le registre principal.
  select public.verifier(
    (select array_agg(tenue_le) from public.registre_hors_exercice())
      = array[date '2026-08-09', date '2025-04-15'],
    'de la plus récente à la plus ancienne');
commit;

-- ---------------------------------------------------------------------------
\echo '— avant et apres ne se confondent pas'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000091"}';

  select public.verifier(
    (select avant from public.registre_hors_exercice() where id = :'avant'::uuid),
    'celle d''avril 2025 précède l''exercice');

  -- Le cas qui compte : une réunion tenue après la clôture. Elle est invisible
  -- partout ailleurs, et elle se multipliera tant que les dates d'exercice
  -- n'auront pas été remises à jour.
  select public.verifier(
    (select avant from public.registre_hors_exercice() where id = :'apres'::uuid) = false,
    'celle d''août 2026 la suit — c''est le cas qui se rencontre aujourd''hui');
commit;

-- ---------------------------------------------------------------------------
\echo '— montrer n est pas compter'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000091"}';

  select public.pointer_a_l_appel(:'apres'::uuid, :'r_noe'::uuid, 'Présent');
  select public.pointer_a_l_appel(:'dedans'::uuid, :'r_noe'::uuid, 'Présent');

  select public.verifier(
    (select presents from public.registre_hors_exercice() where id = :'apres'::uuid) = 1,
    'la réunion hors bornes affiche bien sa présence');

  -- Une seule des deux entre dans l'assiduité : celle de l'exercice.
  select public.verifier(
    (select presences from public.feuille_d_appel(:'apres'::uuid)
      where referent_id = :'r_noe'::uuid) = 1,
    'mais l''assiduité de l''exercice n''en compte qu''une — celle de février');
commit;

-- ---------------------------------------------------------------------------
\echo '— une reunion retiree ne reapparait pas par cette porte'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000091"}';

  select public.retirer_une_reunion(:'apres'::uuid);

  select public.verifier(
    (select count(*) from public.registre_hors_exercice()) = 1,
    'retirée, elle quitte aussi ce registre-ci');

  select public.rendre_une_reunion(:'apres'::uuid);

  select public.verifier(
    (select count(*) from public.registre_hors_exercice()) = 2,
    'et elle y revient quand on la rend');
commit;

-- ---------------------------------------------------------------------------
\echo '— et une autre loge n y lit rien'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-000000000000"}', true);
  if (select count(*) from public.registre_hors_exercice()) > 0 then
    raise exception 'ÉCHEC — un registre se lit sans loge';
  end if;
  raise notice '  ok — sans loge, aucun registre';
end
$$;

\echo ''
\echo 'Tous les contrôles de 0038_registre_hors_exercice.sql sont passés.'
