-- Tests de la migration 0089_secteurs_de_la_loge.sql.
--
-- Ce qu'on éprouve :
--   * une loge coche des secteurs, de la division à la sous-classe — ni
--     nombre, ni nom ;
--   * pas la section seule, pas deux fois le même code ;
--   * la date de la liste, sur la loge, bouge quand on coche et quand on
--     décoche ;
--   * supprimer la loge emporte sa liste ; le départ de qui a coché laisse la
--     ligne ;
--   * la table est fermée.
--
-- Données fabriquées : deux loges et un référent d'essai, aucune personne
-- réelle.

\set ON_ERROR_STOP on
\o /dev/null

insert into public.loge (bubble_id, nom) values
  ('loge-0089-a', 'Loge d''essai 0089 A'),
  ('loge-0089-b', 'Loge d''essai 0089 B')
on conflict (bubble_id) do nothing;

select id as loge_a from public.loge where bubble_id = 'loge-0089-a' \gset
select id as loge_b from public.loge where bubble_id = 'loge-0089-b' \gset

insert into public.referent (bubble_id, nom, prenom, loge_id)
values ('ref-0089', 'ESSAI', 'Sacha', :'loge_a')
on conflict (bubble_id) do nothing;
select id as ref from public.referent where bubble_id = 'ref-0089' \gset

\echo '— ni nombre ni nom : un code coché, c''est tout'
select public.verifier(
  (select array_agg(column_name::text order by ordinal_position)
     from information_schema.columns
    where table_schema = 'public' and table_name = 'loge_secteur')
  = array['loge_id', 'code', 'coche_le', 'coche_par'],
  'la table porte la loge, le code, et quand et par qui il a été coché');

\echo '— la loge naît sans liste'
select public.verifier(
  (select secteurs_maj_le is null from public.loge where id = :'loge_a'),
  'aucune date tant que rien n''est coché');

\echo '— de la division à la sous-classe'
insert into public.loge_secteur (loge_id, code, coche_par) values
  (:'loge_a', '43',     :'ref'),
  (:'loge_a', '43.21A', :'ref'),
  (:'loge_a', '86.9',   :'ref'),
  (:'loge_a', '56.10',  :'ref');

select public.verifier(
  (select string_agg(code, ' ' order by code)
     from public.loge_secteur where loge_id = :'loge_a') = '43 43.21A 56.10 86.9',
  'une division, une sous-classe, une classe, un groupe');

select public.verifier(
  (select secteurs_maj_le is not null from public.loge where id = :'loge_a'),
  'cocher date la liste de la loge');

\echo '— ce que la table refuse'
select set_config('essai.loge_a', :'loge_a', false);

do $$
declare
  loge uuid := current_setting('essai.loge_a')::uuid;
begin
  begin
    insert into public.loge_secteur (loge_id, code) values (loge, 'F');
    raise exception 'ÉCHEC — une section seule a été cochée';
  exception when check_violation then
    raise notice '  ok — refusé : une section seule, trop large pour une loge';
  end;

  begin
    insert into public.loge_secteur (loge_id, code) values (loge, '43');
    raise exception 'ÉCHEC — le même secteur est coché deux fois';
  exception when unique_violation then
    raise notice '  ok — refusé : le même secteur deux fois';
  end;

  begin
    insert into public.loge_secteur (loge_id, code) values (loge, '00.00Z');
    raise exception 'ÉCHEC — un code inconnu est entré';
  exception when foreign_key_violation then
    raise notice '  ok — refusé : un code qui n''est pas dans la nomenclature';
  end;
end
$$;

\echo '— la date suit la liste'
update public.loge set secteurs_maj_le = now() - interval '1 year' where id = :'loge_a';
delete from public.loge_secteur where loge_id = :'loge_a' and code = '56.10';
select public.verifier(
  (select secteurs_maj_le > now() - interval '1 hour' from public.loge where id = :'loge_a'),
  'décocher rajeunit la date — la ligne disparaît, la loge garde la date');

update public.loge set secteurs_maj_le = now() - interval '1 year' where id in (:'loge_a', :'loge_b');
update public.loge_secteur set loge_id = :'loge_b' where loge_id = :'loge_a' and code = '86.9';
select public.verifier(
  (select bool_and(secteurs_maj_le > now() - interval '1 hour')
     from public.loge where id in (:'loge_a', :'loge_b')),
  'une ligne qui change de loge date les deux loges, la quittée comme l''accueillante');

\echo '— départs'
delete from public.referent where id = :'ref';
select public.verifier(
  (select count(*) from public.loge_secteur where loge_id = :'loge_a' and coche_par is null) = 2,
  'le départ de qui a coché laisse les secteurs cochés');

delete from public.loge where id = :'loge_b';
select public.verifier(
  not exists (select 1 from public.loge_secteur where loge_id = :'loge_b'),
  'supprimer la loge emporte sa liste');

\echo '— fermée'
select public.verifier(
  (select relrowsecurity from pg_class where oid = 'public.loge_secteur'::regclass)
    and (select count(*) from pg_policies
          where schemaname = 'public' and tablename = 'loge_secteur') = 0,
  'RLS active, aucune policy');

do $$
begin
  set local role authenticated;
  begin
    perform 1 from public.loge_secteur limit 1;
    raise exception 'ÉCHEC — une session connectée lit les secteurs des loges';
  exception when insufficient_privilege then
    raise notice '  ok — une session connectée ne lit rien';
  end;
end
$$;

do $$
begin
  set local role anon;
  begin
    perform 1 from public.loge_secteur limit 1;
    raise exception 'ÉCHEC — une personne non connectée lit les secteurs des loges';
  exception when insufficient_privilege then
    raise notice '  ok — une personne non connectée ne lit rien';
  end;
end
$$;

-- --- Ménage ----------------------------------------------------------------
delete from public.loge where id = :'loge_a';

\o
\echo '0089 — les secteurs présents dans une loge : tout est vert.'
