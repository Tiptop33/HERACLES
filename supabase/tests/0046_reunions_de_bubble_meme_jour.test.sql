-- Tests de la migration 0046_reunions_de_bubble_meme_jour.sql.
--
-- Le cas réel du 10 août 2026 : cinq réunions de Bubble saisies le même jour,
-- que l'index refusait — et qui faisaient échouer tout le déversement.
--
--   · Yuri  référent à Nantes-0046

\set ON_ERROR_STOP on
\o /dev/null

\set yuri 'aaaaaaaa-3333-0000-0000-000000000161'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'yuri', 'yuri0046@example.org', '{"role":"referent"}');

insert into public.loge (bubble_id, nom) values ('loge-0046', 'Nantes — 0046')
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, email, loge_id) values
  ('ref-0046-yuri', :'yuri', 'Yuri', 'Y', 'yuri0046@example.org',
   (select id from public.loge where bubble_id = 'loge-0046'))
on conflict do nothing;

select id as l_0046 from public.loge where bubble_id = 'loge-0046' \gset
select id as r_yuri from public.referent where bubble_id = 'ref-0046-yuri' \gset

insert into public.parametre (id, date_depart, date_fin)
values (true, current_date - 60, current_date + 60)
on conflict (id) do update set date_depart = excluded.date_depart,
                               date_fin    = excluded.date_fin;

-- ---------------------------------------------------------------------------
\echo '— cinq reunions de Bubble peuvent partager un jour'
-- ---------------------------------------------------------------------------
-- Avant 0046, la deuxième levait une violation d'index unique, et le
-- déversement entier s'arrêtait : aucune des 24 n'entrait.
insert into public.reunion (bubble_id, loge_id, tenue_le, ouverte_par) values
  ('reunion-b-1', :'l_0046'::uuid, current_date - 7, :'r_yuri'::uuid),
  ('reunion-b-2', :'l_0046'::uuid, current_date - 7, :'r_yuri'::uuid),
  ('reunion-b-3', :'l_0046'::uuid, current_date - 7, :'r_yuri'::uuid),
  ('reunion-b-4', :'l_0046'::uuid, current_date - 7, :'r_yuri'::uuid),
  ('reunion-b-5', :'l_0046'::uuid, current_date - 7, :'r_yuri'::uuid);

select public.verifier(
  (select count(*) from public.reunion
    where loge_id = :'l_0046'::uuid and tenue_le = current_date - 7) = 5,
  'les cinq réunions reprises de Bubble entrent toutes');

-- ---------------------------------------------------------------------------
\echo '— mais la regle tient toujours pour ce qui s ouvre ici'
-- ---------------------------------------------------------------------------
insert into public.reunion (loge_id, tenue_le, ouverte_par)
values (:'l_0046'::uuid, current_date - 3, :'r_yuri'::uuid);

do $$
begin
  begin
    insert into public.reunion (loge_id, tenue_le, ouverte_par)
    values ((select id from public.loge where bubble_id = 'loge-0046'),
            current_date - 3,
            (select id from public.referent where bubble_id = 'ref-0046-yuri'));
    raise exception 'ÉCHEC — deux réunions ouvertes ici le même jour';
  exception when unique_violation then
    raise notice '  ok — le double-clic est toujours refusé';
  end;
end
$$;

-- ---------------------------------------------------------------------------
\echo '— une reunion de Bubble ne capture pas l appel du soir'
-- ---------------------------------------------------------------------------
-- Le jour où l'on tient une réunion qui tombe sur la date d'une réunion
-- reprise, `ouvrir_une_reunion` doit rendre celle d'ici, pas le souvenir.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000161"}';

  -- Il n'y a que des réunions de Bubble ce jour-là : la première ouverture en
  -- rend une, et c'est bien — la loge n'en tiendra pas une sixième.
  select public.ouvrir_une_reunion(current_date - 7) as rouverte  \gset
  -- Le second appel doit rendre exactement la même. Sans `order by`,
  -- `select into` en aurait pris une au hasard parmi les cinq.
  select public.ouvrir_une_reunion(current_date - 7) as rouverte2 \gset
commit;

-- Hors session : `reunion` est fermée à `authenticated`, tout y passe par des
-- fonctions.
select public.verifier(
  :'rouverte2' = :'rouverte',
  'deux ouvertures de suite rendent la même — c''est déterministe');

select public.verifier(
  (select bubble_id from public.reunion where id = :'rouverte'::uuid) is not null,
  'et faute de réunion d''ici, c''est bien celle de Bubble qu''on rouvre');

-- Maintenant une réunion ouverte ici, le même jour que les cinq de Bubble.
insert into public.reunion (loge_id, tenue_le, ouverte_par)
values (:'l_0046'::uuid, current_date - 7, :'r_yuri'::uuid);

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000161"}';
  select public.ouvrir_une_reunion(current_date - 7) as ensuite \gset
commit;

select public.verifier(
  (select bubble_id from public.reunion where id = :'ensuite'::uuid) is null,
  'dès qu''une réunion est ouverte ici, c''est elle qu''on rouvre — pas le souvenir');

-- ---------------------------------------------------------------------------
\echo '— et le registre les montre toutes'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000161"}';

  -- Six réunions ce jour-là : les cinq de Bubble et celle d'ici. Aucune n'est
  -- perdue, c'est tout l'objet de cette migration.
  select public.verifier(
    (select count(*) from public.registre_des_reunions()
      where tenue_le = current_date - 7) = 6,
    'les six figurent au registre, à la même date');
commit;

-- ---------------------------------------------------------------------------
\echo '— le deversement passe sur cinq reunions saisies le meme jour'
-- ---------------------------------------------------------------------------
-- Le cas de production du 10 août 2026, reproduit ici parce qu'il a bloqué
-- tous les déploiements : 0036 déverse les réunions à la fin de la migration.
-- Avec cinq réunions Bubble sur un même jour de saisie, elle échouait — donc
-- 0046, qui corrige l'index, n'était jamais atteinte. Blocage circulaire.
insert into public.bubble_brut (type_bubble, bubble_id, donnees)
select 'reunion', 'rb-0046-' || n,
       jsonb_build_object(
         '_id',          'rb-0046-' || n,
         'Created Date', '2026-02-25T18:0' || n || ':00.000Z',
         'Created By',   'ref-0046-yuri',
         'referent',     jsonb_build_array('ref-0046-yuri'))
  from generate_series(1, 5) as n
on conflict (type_bubble, bubble_id) do nothing;

select reunions as posees, pointages
  from public.deverser_reunions_bubble() \gset

select public.verifier(
  :posees = 5,
  'les cinq réunions du même jour de saisie sont déversées');

select public.verifier(
  :pointages = 5,
  'et leurs cinq pointages avec elles');

-- Rejouable : c'est ce que fait le serveur à chaque déploiement.
select reunions as posees2 from public.deverser_reunions_bubble() \gset

select public.verifier(
  (select count(*) from public.reunion where bubble_id like 'rb-0046-%') = 5,
  'rejouée, elle n''en crée pas cinq de plus');

-- ---------------------------------------------------------------------------
\echo '— et 0036 se rejoue sur une base qui porte deja ces reunions'
-- ---------------------------------------------------------------------------
-- **Le contrôle qui manquait.** Le serveur rejoue TOUTES les migrations à
-- CHAQUE déploiement, et 0036 déverse les réunions à la fin. Le harnais les
-- rejoue lui aussi, mais sur une base où `bubble_brut` est encore vide : la
-- panne du 10 août lui échappait donc entièrement.
--
-- Ici les cinq réunions sont en place. Si 0036 rate, aucun déploiement ne
-- passe plus — c'est exactement ce qui s'est produit.
\i supabase/migrations/0036_reunions_et_appels.sql

select public.verifier(
  (select count(*) from public.reunion where bubble_id like 'rb-0046-%') = 5,
  'la migration se rejoue sans broncher, données Bubble en place');

-- L'index doit être ressorti partiel de ce passage : `if not exists` regarde
-- le nom et non la définition, d'où le `drop` qui le précède.
select public.verifier(
  (select indexdef like '%bubble_id IS NULL%' from pg_indexes
    where indexname = 'reunion_loge_jour_idx'),
  'et l''index est bien resté partiel');

\echo ''
\echo 'Tous les contrôles de 0046_reunions_de_bubble_meme_jour.sql sont passés.'
