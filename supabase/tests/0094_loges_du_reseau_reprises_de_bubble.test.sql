-- Tests de la migration 0094_loges_du_reseau_reprises_de_bubble.sql.
--
-- Le réseau, tout fabriqué (aucune loge, aucune adresse réelle) :
--   · la loge de l'application « HERACLES » et une autre, « AUTRE 0094 » ;
--   · dans Bubble, quatre loges rattachées à HERACLES :
--       b1  « LOGE UN 0094 »    n° 90941, province connue, adresse, logo
--       b2  « LOGE DEUX 0094 »  n° 90942, adresse invalide, sans logo
--       b3  « LOGE TROIS 0094 » n° 90943 — déjà saisie à la main au même numéro
--       b4  sans nom
--     et une rattachée à l'autre loge, qui ne doit pas venir.

\set ON_ERROR_STOP on
\o /dev/null

insert into public.loge (bubble_id, nom) values
  ('lr-0094-heracles', 'HERACLES'),
  ('lr-0094-autre',    'AUTRE 0094')
on conflict (bubble_id) do nothing;

insert into public.province (bubble_id, nom) values ('prov-0094', 'Province 0094')
on conflict (bubble_id) do nothing;
select id as prov from public.province where bubble_id = 'prov-0094' \gset

-- La loge saisie à la main avant la reprise, avec son Secrétaire et son adresse.
insert into public.loge_du_reseau (nom, numero, secretaire_nom, secretaire_email)
values ('Loge Trois, saisie 0094', '90943', 'Secrétaire Trois', 'trois.saisie@example.org');

insert into public.bubble_brut (type_bubble, bubble_id, donnees) values
  ('loges', 'b-0094-1', '{"_id":"b-0094-1","NOM_LOGES":" LOGE UN 0094 ","numero loge":90941,"PROVINCE":"Province 0094","Ville":"Ville","EMAIL_LOGES":" Un@Example.org ","logo":"//cdn.example.org/un.png","LOGE-LOGEREF":"lr-0094-heracles"}'),
  ('loges', 'b-0094-2', '{"_id":"b-0094-2","NOM_LOGES":"LOGE DEUX 0094","numero loge":90942.0,"PROVINCE":"Inconnue 0094","EMAIL_LOGES":"pas une adresse","LOGE-LOGEREF":"lr-0094-heracles"}'),
  ('loges', 'b-0094-3', '{"_id":"b-0094-3","NOM_LOGES":"LOGE TROIS 0094","numero loge":90943,"PROVINCE":"prov-0094","EMAIL_LOGES":"trois@example.org","logo":"https://cdn.example.org/trois.jpg","LOGE-LOGEREF":"lr-0094-heracles"}'),
  ('loges', 'b-0094-4', '{"_id":"b-0094-4","NOM_LOGES":"  ","numero loge":90944,"LOGE-LOGEREF":"lr-0094-heracles"}'),
  ('loges', 'b-0094-5', '{"_id":"b-0094-5","NOM_LOGES":"LOGE AILLEURS 0094","numero loge":90945,"LOGE-LOGEREF":"lr-0094-autre"}')
on conflict (type_bubble, bubble_id) do nothing;

create or replace function pg_temp.loge(le_bubble text) returns public.loge_du_reseau language sql as $$
  select * from public.loge_du_reseau where bubble_id = le_bubble
$$;

-- ===========================================================================
\echo '— le premier passage'
select * from public.deverser_loges_du_reseau_bubble() \gset
select public.verifier(:lues = 4, 'quatre loges lues : celles de HERACLES, pas celle de l''autre loge');
select public.verifier(:creees = 2 and :rattachees = 1 and :laissees = 1,
  'deux créées, une rattachée à la loge saisie, une laissée faute de nom');
select public.verifier(:sans_province = 1, 'une province introuvable, comptée');

select public.verifier(
  (pg_temp.loge('b-0094-1')).nom = 'LOGE UN 0094'
    and (pg_temp.loge('b-0094-1')).numero = '90941'
    and (pg_temp.loge('b-0094-1')).province_id = :'prov'::uuid
    and (pg_temp.loge('b-0094-1')).secretaire_email = 'un@example.org'
    and (pg_temp.loge('b-0094-1')).secretaire_nom is null
    and (pg_temp.loge('b-0094-1')).ecusson_url = 'https://cdn.example.org/un.png'
    and (pg_temp.loge('b-0094-1')).ecusson_chemin is null,
  'b1 : nom, numéro, province par son nom, adresse en minuscules dans « adresse du Secrétaire », logo à rapatrier');
select public.verifier(
  (pg_temp.loge('b-0094-2')).numero = '90942'
    and (pg_temp.loge('b-0094-2')).secretaire_email is null
    and (pg_temp.loge('b-0094-2')).province_id is null,
  'b2 : « 90942.0 » devient 90942 ; une adresse invalide reste vide ; province inconnue, vide');
select public.verifier(
  (pg_temp.loge('b-0094-3')).nom = 'Loge Trois, saisie 0094'
    and (pg_temp.loge('b-0094-3')).secretaire_nom = 'Secrétaire Trois'
    and (pg_temp.loge('b-0094-3')).secretaire_email = 'trois.saisie@example.org'
    and (pg_temp.loge('b-0094-3')).province_id = :'prov'::uuid
    and (pg_temp.loge('b-0094-3')).ecusson_url = 'https://cdn.example.org/trois.jpg',
  'b3 : la loge saisie à la main garde son nom, son Secrétaire et son adresse ; le vide est rempli (province par son identifiant, logo)');
select public.verifier(
  (select count(*) from public.loge_du_reseau where numero = '90943') = 1,
  'pas de doublon au même numéro');
select public.verifier(
  not exists (select 1 from public.loge_du_reseau where nom like 'LOGE AILLEURS%'),
  'la loge rattachée à une autre loge de l''application n''est pas prise');

-- ===========================================================================
\echo '— rejouer'
select * from public.deverser_loges_du_reseau_bubble() \gset
select public.verifier(:creees = 0 and :rattachees = 0 and :completees = 0,
  'rejouer ne crée ni ne change rien');

\echo '— l''administration corrige, Bubble change : l''administration l''emporte'
update public.loge_du_reseau set secretaire_email = 'corrige@example.org' where bubble_id = 'b-0094-1';
update public.bubble_brut set donnees = donnees || '{"EMAIL_LOGES":"autre@example.org","NOM_LOGES":"NOUVEAU NOM"}'
 where bubble_id = 'b-0094-1';
update public.bubble_brut set donnees = donnees || '{"EMAIL_LOGES":"deux@example.org"}' where bubble_id = 'b-0094-2';
select * from public.deverser_loges_du_reseau_bubble() \gset
select public.verifier(
  (pg_temp.loge('b-0094-1')).secretaire_email = 'corrige@example.org'
    and (pg_temp.loge('b-0094-1')).nom = 'LOGE UN 0094',
  'ce que l''administration a saisi n''est pas remplacé');
select public.verifier(
  (pg_temp.loge('b-0094-2')).secretaire_email = 'deux@example.org' and :completees = 1,
  'une adresse apparue dans Bubble remplit la case vide');

\echo '— une loge retirée ne revient pas'
delete from public.loge_du_reseau where bubble_id = 'b-0094-2';
select * from public.deverser_loges_du_reseau_bubble() \gset
select public.verifier(pg_temp.loge('b-0094-2') is null and :creees = 0,
  'b2, retirée par l''administration, n''est pas recréée');

\echo '— l''écusson rapatrié respecte le chemin de la table'
do $$
declare
  l uuid := (select id from public.loge_du_reseau where bubble_id = 'b-0094-1');
begin
  update public.loge_du_reseau set ecusson_chemin = 'loge-du-reseau/ecusson/' || l || '.png' where id = l;
  begin
    update public.loge_du_reseau set ecusson_chemin = 'loge-du-reseau/ecusson/b-0094-1/un.png' where id = l;
    raise exception 'ÉCHEC — un chemin hors règle a été accepté';
  exception when check_violation then
    raise notice '  ok — refusé : un écusson rangé ailleurs que sous l''identifiant de la loge';
  end;
end
$$;

\echo '— sans la loge HERACLES, la reprise le dit'
do $$
begin
  perform * from public.deverser_loges_du_reseau_bubble('INCONNUE 0094');
  raise exception 'ÉCHEC — une loge inconnue n''a rien signalé';
exception when no_data_found then
  raise notice '  ok — refusé : une loge de l''application introuvable';
end
$$;

\echo '— fermé à l''application'
begin;
  set local role authenticated;
  do $$
  begin
    begin
      perform * from public.deverser_loges_du_reseau_bubble();
      raise exception 'ÉCHEC — une session a lancé la reprise';
    exception when insufficient_privilege then
      raise notice '  ok — refusé : la reprise, à une session';
    end;
    begin
      perform 1 from public.loge_du_reseau_bubble;
      raise exception 'ÉCHEC — la mémoire de la reprise se lit';
    exception when insufficient_privilege then
      raise notice '  ok — refusé : la mémoire de la reprise';
    end;
  end
  $$;
commit;

-- Rien ne reste : d'autres tests comptent les loges.
delete from public.loge_du_reseau where numero in ('90941', '90942', '90943', '90944', '90945');
delete from public.loge_du_reseau_bubble where bubble_id like 'b-0094-%';
delete from public.bubble_brut where bubble_id like 'b-0094-%';
delete from public.loge where bubble_id like 'lr-0094-%';
delete from public.province where bubble_id = 'prov-0094';

\o
\echo '0094 — les loges du réseau, reprises de Bubble : tout est vert'
