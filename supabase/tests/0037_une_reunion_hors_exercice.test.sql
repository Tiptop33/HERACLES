-- Tests de la migration 0037_une_reunion_hors_exercice.sql.
--
-- Le cas qui a fait écrire cette migration : l'exercice enregistré était
-- terminé, toute réunion tenue depuis tombait hors bornes, et l'écran ne
-- montrait rien. On vérifie ici qu'une réunion se lit par son identifiant
-- quelles que soient les dates — et que le registre, lui, continue de ne
-- compter que l'exercice.
--
--   · Maya   référente à Auch-0037

\set ON_ERROR_STOP on
\o /dev/null

\set maya 'aaaaaaaa-3333-0000-0000-000000000081'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'maya', 'maya0037@example.org', '{"role":"referent","nom":"Maya","prenom":"M"}');

insert into public.loge (bubble_id, nom) values ('loge-0037-auch', 'Auch — 0037')
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, email, loge_id) values
  ('ref-0037-maya', :'maya', 'Maya', 'M', 'maya0037@example.org',
   (select id from public.loge where bubble_id = 'loge-0037-auch'))
on conflict do nothing;

select id as r_maya from public.referent where bubble_id = 'ref-0037-maya' \gset

-- Un exercice **terminé**, exactement comme celui trouvé en base le 9 août
-- 2026 : du 1er septembre 2025 au 31 juillet 2026.
insert into public.parametre (id, date_depart, date_fin)
values (true, '2025-09-01', '2026-07-31')
on conflict (id) do update set date_depart = excluded.date_depart,
                               date_fin    = excluded.date_fin;

-- ---------------------------------------------------------------------------
\echo '— une reunion hors exercice s ouvre et se lit'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000081"}';

  -- Le 9 août 2026 : après la fin de l'exercice. C'est le cas réel.
  select public.ouvrir_une_reunion(date '2026-08-09', 'Temple') as tardive \gset

  select public.verifier(
    (select count(*) from public.registre_des_reunions()) = 0,
    'le registre ne la montre pas — elle n''est pas de l''exercice, et c''est juste');

  -- Avant 0037, l'écran s'arrêtait là et n'affichait rien.
  select public.verifier(
    (select count(*) from public.la_reunion(:'tardive'::uuid)) = 1,
    'mais elle se lit par son identifiant : la feuille d''appel peut s''ouvrir');

  select public.verifier(
    (select hors_exercice from public.la_reunion(:'tardive'::uuid)),
    'et elle se sait hors exercice — l''écran peut le dire au lieu de disparaître');

  select public.verifier(
    (select count(*) from public.feuille_d_appel(:'tardive'::uuid)) = 1,
    'sa feuille porte bien la référente de la loge');
commit;

-- ---------------------------------------------------------------------------
\echo '— une reunion dans l exercice ne se signale pas'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000081"}';

  select public.ouvrir_une_reunion(date '2026-03-12') as dedans \gset

  select public.verifier(
    (select hors_exercice from public.la_reunion(:'dedans'::uuid)) = false,
    'celle de mars tombe dans les bornes');

  select public.verifier(
    (select count(*) from public.registre_des_reunions()) = 1,
    'et c''est la seule que le registre compte');
commit;

-- ---------------------------------------------------------------------------
\echo '— les comptes suivent, hors exercice comme dedans'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000081"}';

  select public.pointer_a_l_appel(:'tardive'::uuid, :'r_maya'::uuid, 'Présent');

  select public.verifier(
    (select presents from public.la_reunion(:'tardive'::uuid)) = 1
      and (select effectif from public.la_reunion(:'tardive'::uuid)) = 1,
    'la feuille compte sa présence, même hors exercice');

  -- Depuis 0045, les comptes de la feuille ne portent que sur la réunion
  -- ouverte : les bornes de l'exercice ne les commandent plus. Le registre,
  -- lui, reste borné — c'est ce qu'affirme le premier contrôle ci-dessus.
  select public.verifier(
    (select presences from public.feuille_d_appel(:'tardive'::uuid)
      where referent_id = :'r_maya'::uuid) = 1,
    'et sa ligne aussi, puisque la feuille ne compte plus qu''elle-même');
commit;

-- ---------------------------------------------------------------------------
\echo '— et une session sans loge n y lit rien'
-- ---------------------------------------------------------------------------
-- L'identifiant se lit hors session : la table est fermée à `authenticated`,
-- et c'est justement ce qu'on veut éprouver plus bas.
select set_config('essai.tardive', :'tardive', false);

do $$
begin
  set local role authenticated;
  -- Sans fiche de référent, `ma_loge()` est nulle : la jointure ne rend rien.
  -- La fonction ne lève pas, elle se tait — de l'extérieur, une réunion qu'on
  -- n'a pas le droit de voir et une réunion absente se ressemblent.
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-000000000000"}', true);
  if (select count(*) from public.la_reunion(
        current_setting('essai.tardive')::uuid)) > 0 then
    raise exception 'ÉCHEC — une réunion se lit sans loge';
  end if;
  raise notice '  ok — sans loge, aucune réunion';
end
$$;

\echo ''
\echo 'Tous les contrôles de 0037_une_reunion_hors_exercice.sql sont passés.'
