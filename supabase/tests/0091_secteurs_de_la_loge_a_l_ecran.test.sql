-- Tests de la migration 0091_secteurs_de_la_loge_a_l_ecran.sql.
--
-- Qui est qui, dans deux loges d'essai :
--
--   · Sophie  Secrétaire, loge Nord   — coche dans sa loge, pas ailleurs
--   · Victor  Vénérable Maître, Nord  — lit, ne coche pas
--   · Rémi    référent, Nord          — lit, ne coche pas, ne cherche pas
--   · Sami    Secrétaire, loge Sud    — ne lit pas la liste du Nord
--   · Ada     administratrice         — lit et coche partout
--   · Camille compte candidat         — rien
--
-- Chaque contrôle se joue en devenant la personne (CLAUDE.md).
--
-- Données fabriquées : aucune personne réelle.

\set ON_ERROR_STOP on
\o /dev/null

\set sophie  'dddddddd-0091-0000-0000-000000000001'
\set victor  'dddddddd-0091-0000-0000-000000000002'
\set remi    'dddddddd-0091-0000-0000-000000000003'
\set sami    'dddddddd-0091-0000-0000-000000000004'
\set ada     'dddddddd-0091-0000-0000-000000000005'
\set camille 'dddddddd-0091-0000-0000-000000000006'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'sophie',  'sophie0091@example.org',  '{"role":"referent"}'),
  (:'victor',  'victor0091@example.org',  '{"role":"referent"}'),
  (:'remi',    'remi0091@example.org',    '{"role":"referent"}'),
  (:'sami',    'sami0091@example.org',    '{"role":"referent"}'),
  (:'ada',     'ada0091@example.org',     '{"role":"referent"}'),
  (:'camille', 'camille0091@example.org', '{"role":"chercheur"}')
on conflict (id) do nothing;

update public.profil set role = 'admin' where id = :'ada';

insert into public.loge (bubble_id, nom) values
  ('loge-0091-nord', 'Nord — 0091'),
  ('loge-0091-sud',  'Sud — 0091')
on conflict (bubble_id) do nothing;

select id as nord from public.loge where bubble_id = 'loge-0091-nord' \gset
select id as sud  from public.loge where bubble_id = 'loge-0091-sud' \gset

-- Le titre tel que Bubble l'a laissé : majuscules, espaces autour, accent ou non.
insert into public.referent (bubble_id, profil_id, nom, prenom, loge_id, college) values
  ('ref-0091-sophie', :'sophie', 'SOPHIE', 'Sophie', :'nord'::uuid, ' Secrétaire '),
  ('ref-0091-victor', :'victor', 'VICTOR', 'Victor', :'nord'::uuid, 'Vénérable Maître'),
  ('ref-0091-remi',   :'remi',   'REMI',   'Rémi',   :'nord'::uuid, null),
  ('ref-0091-sami',   :'sami',   'SAMI',   'Sami',   :'sud'::uuid,  'SECRETAIRE')
on conflict (bubble_id) do nothing;

select id as r_sophie from public.referent where bubble_id = 'ref-0091-sophie' \gset

-- Un secteur déjà coché au Sud, pour vérifier que le Nord ne le voit pas.
insert into public.loge_secteur (loge_id, code) values (:'sud'::uuid, '86')
on conflict do nothing;

-- Les droits se testent dans des transactions séparées : `set local` ne dure
-- que jusqu'au `commit`.

\echo '— Sophie, Secrétaire du Nord : coche chez elle'
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"' || :'sophie' || '"}', true);

  select public.verifier(public.puis_je_tenir_les_secteurs(:'nord'::uuid),
    'elle tient la liste du Nord — « Secrétaire » reconnu malgré la casse et les espaces');
  select public.verifier(not public.puis_je_tenir_les_secteurs(:'sud'::uuid),
    'pas celle du Sud');

  select public.verifier(
    (public.cocher_un_secteur(:'nord'::uuid, '43', true) -> 'secteurs' -> 0 ->> 'code') = '43',
    'cocher 43 rend la liste à jour');
  select public.cocher_un_secteur(:'nord'::uuid, '43.21A', true);
  select public.cocher_un_secteur(:'nord'::uuid, '43', true);  -- deux fois : sans effet, sans erreur

  select public.verifier(
    (select jsonb_agg(e ->> 'code') from jsonb_array_elements(public.secteurs_de_la_loge(:'nord'::uuid) -> 'secteurs') e)
      = '["43", "43.21A"]'::jsonb,
    'la liste porte 43 et 43.21A, une fois chacun');

  select public.verifier(
    (select e ->> 'division' = '43' and e ->> 'section' = 'F' and e ->> 'section_intitule' = 'Construction'
       from jsonb_array_elements(public.secteurs_de_la_loge(:'nord'::uuid) -> 'secteurs') e
      where e ->> 'code' = '43.21A'),
    'chaque secteur porte sa division et sa section');

  select public.verifier(
    (public.secteurs_de_la_loge(:'nord'::uuid) ->> 'modifiable')::boolean
      and public.secteurs_de_la_loge(:'nord'::uuid) ->> 'maj_le' is not null,
    'elle voit la liste modifiable, datée');

  select public.verifier(
    exists (select 1 from public.rechercher_secteur_pour_la_loge('restauration') where code = '56.10A'),
    'elle cherche un secteur, jusqu''aux niveaux fins');
  select public.verifier(
    jsonb_array_length(public.nomenclature_naf_pour_la_loge()) = 1728,
    'elle parcourt toute la nomenclature');
commit;

select public.verifier(
  (select coche_par from public.loge_secteur where loge_id = :'nord'::uuid and code = '43') = :'r_sophie'::uuid,
  'la base retient qui a coché');

do $$
declare
  sophie uuid := 'dddddddd-0091-0000-0000-000000000001';
  sud    uuid := (select id from public.loge where bubble_id = 'loge-0091-sud');
  nord   uuid := (select id from public.loge where bubble_id = 'loge-0091-nord');
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', sophie)::text, true);

  begin
    perform public.cocher_un_secteur(sud, '56', true);
    raise exception 'ÉCHEC — Sophie a coché dans la loge du Sud';
  exception when insufficient_privilege then
    raise notice '  ok — refusé : cocher dans une autre loge';
  end;

  begin
    perform public.cocher_un_secteur(nord, 'F', true);
    raise exception 'ÉCHEC — une section seule a été cochée';
  exception when check_violation then
    raise notice '  ok — refusé : une section seule (0089)';
  end;

  begin
    perform public.cocher_un_secteur(nord, '00.00Z', true);
    raise exception 'ÉCHEC — un code inconnu a été coché';
  exception when foreign_key_violation then
    raise notice '  ok — refusé : un code hors nomenclature';
  end;
end
$$;

\echo '— décocher'
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"' || :'sophie' || '"}', true);
  select public.cocher_un_secteur(:'nord'::uuid, '43.21A', false);
  select public.verifier(
    jsonb_array_length(public.secteurs_de_la_loge(:'nord'::uuid) -> 'secteurs') = 1,
    'décocher 43.21A laisse 43 seul');
commit;

\echo '— Victor, Vénérable Maître, et Rémi, référent : ils lisent, ne cochent pas'
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"' || :'victor' || '"}', true);
  select public.verifier(
    jsonb_array_length(public.secteurs_de_la_loge(:'nord'::uuid) -> 'secteurs') = 1
      and not (public.secteurs_de_la_loge(:'nord'::uuid) ->> 'modifiable')::boolean,
    'Victor lit la liste du Nord, en lecture seule');
commit;

begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"' || :'remi' || '"}', true);
  select public.verifier(
    (public.secteurs_de_la_loge(:'nord'::uuid) -> 'secteurs' -> 0 ->> 'code') = '43',
    'Rémi lit la liste du Nord');
  select public.verifier(public.secteurs_de_la_loge(:'sud'::uuid) is null,
    'mais pas celle du Sud');
commit;

do $$
declare
  nord uuid := (select id from public.loge where bubble_id = 'loge-0091-nord');
  qui  uuid;
begin
  foreach qui in array array['dddddddd-0091-0000-0000-000000000002'::uuid,
                             'dddddddd-0091-0000-0000-000000000003'::uuid] loop
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', qui)::text, true);

    begin
      perform public.cocher_un_secteur(nord, '56', true);
      raise exception 'ÉCHEC — % a coché sans être Secrétaire', qui;
    exception when insufficient_privilege then
      raise notice '  ok — refusé : cocher sans être Secrétaire';
    end;

    begin
      perform 1 from public.rechercher_secteur_pour_la_loge('restauration');
      raise exception 'ÉCHEC — % a lancé la recherche', qui;
    exception when insufficient_privilege then
      raise notice '  ok — refusé : la recherche, sans rien à cocher';
    end;

    begin
      perform public.nomenclature_naf_pour_la_loge();
      raise exception 'ÉCHEC — % a reçu la nomenclature', qui;
    exception when insufficient_privilege then
      raise notice '  ok — refusé : la nomenclature, sans rien à cocher';
    end;
    reset role;
  end loop;
end
$$;

\echo '— Sami, Secrétaire du Sud : rien du Nord'
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"' || :'sami' || '"}', true);
  select public.verifier(public.secteurs_de_la_loge(:'nord'::uuid) is null,
    'Sami ne lit pas la liste du Nord');
  select public.verifier(
    (public.secteurs_de_la_loge(:'sud'::uuid) -> 'secteurs' -> 0 ->> 'code') = '86'
      and (public.secteurs_de_la_loge(:'sud'::uuid) ->> 'modifiable')::boolean,
    'il tient celle du Sud — « SECRETAIRE » sans accent reconnu');
commit;

\echo '— Ada, administratrice : partout'
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"' || :'ada' || '"}', true);
  select public.verifier(
    public.secteurs_de_la_loge(:'nord'::uuid) is not null
      and public.secteurs_de_la_loge(:'sud'::uuid) is not null,
    'elle lit les deux loges');
  select public.verifier(
    jsonb_array_length(public.cocher_un_secteur(:'sud'::uuid, '56', true) -> 'secteurs') = 2,
    'elle coche au Sud, en secours');
  select public.verifier(
    exists (select 1 from public.rechercher_secteur_pour_la_loge('boulangerie')),
    'elle cherche');
commit;

\echo '— Camille, compte candidat, et une personne non connectée : rien'
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"' || :'camille' || '"}', true);
  select public.verifier(public.secteurs_de_la_loge(:'nord'::uuid) is null,
    'un compte candidat ne lit aucune liste');
  select public.verifier(not public.puis_je_tenir_les_secteurs(:'nord'::uuid),
    'et n''en tient aucune');
commit;

do $$
begin
  set local role anon;
  begin
    perform public.secteurs_de_la_loge((select id from public.loge where bubble_id = 'loge-0091-nord'));
    raise exception 'ÉCHEC — une personne non connectée appelle secteurs_de_la_loge';
  exception when insufficient_privilege then
    raise notice '  ok — refusé à une personne non connectée';
  end;
end
$$;

\echo '— les tables restent fermées'
select public.verifier(
  not has_table_privilege('authenticated', 'public.loge_secteur', 'select')
    and not has_table_privilege('authenticated', 'public.loge_secteur', 'insert')
    and not has_table_privilege('authenticated', 'public.code_naf', 'select'),
  'aucun droit de table : tout passe par les fonctions');

-- --- Ménage ----------------------------------------------------------------
delete from public.referent where bubble_id like 'ref-0091-%';
delete from public.loge where bubble_id like 'loge-0091-%';

\o
\echo '0091 — les secteurs de la loge, à l''écran : tout est vert.'
