-- Tests de la migration 0089_secteurs_de_la_loge.sql.
--
-- Ce qu'on éprouve :
--   * une loge compte ses membres par division, sans nom ;
--   * pas une section, pas un niveau plus fin, pas zéro, pas mille ;
--   * la date du décompte, sur la loge, bouge à l'ajout, à la correction et
--     au retrait ;
--   * supprimer la loge emporte son décompte ;
--   * la table est fermée.
--
-- Données fabriquées : deux loges d'essai, aucune personne réelle.

\set ON_ERROR_STOP on
\o /dev/null

insert into public.loge (bubble_id, nom) values
  ('loge-0089-a', 'Loge d''essai 0089 A'),
  ('loge-0089-b', 'Loge d''essai 0089 B')
on conflict (bubble_id) do nothing;

select id as loge_a from public.loge where bubble_id = 'loge-0089-a' \gset
select id as loge_b from public.loge where bubble_id = 'loge-0089-b' \gset

\echo '— la loge naît sans décompte'
select public.verifier(
  (select secteurs_maj_le is null from public.loge where id = :'loge_a'),
  'aucune date tant que rien n''est compté');

\echo '— un décompte par division'
insert into public.loge_secteur (loge_id, code, nombre) values
  (:'loge_a', '43', 3),
  (:'loge_a', '86', 1);

select public.verifier(
  (select string_agg(code || ':' || nombre, ' ' order by code)
     from public.loge_secteur where loge_id = :'loge_a') = '43:3 86:1',
  'trois membres en 43, un en 86');

select public.verifier(
  (select secteurs_maj_le is not null from public.loge where id = :'loge_a'),
  'l''ajout date le décompte de la loge');

\echo '— ce que la table refuse'
select set_config('essai.loge_a', :'loge_a', false);

do $$
declare
  loge uuid := current_setting('essai.loge_a')::uuid;
begin
  begin
    insert into public.loge_secteur (loge_id, code, nombre) values (loge, 'F', 2);
    raise exception 'ÉCHEC — une section a été comptée';
  exception when check_violation then
    raise notice '  ok — refusé : une section, trop large pour un décompte';
  end;

  begin
    insert into public.loge_secteur (loge_id, code, nombre) values (loge, '43.21A', 2);
    raise exception 'ÉCHEC — une sous-classe a été comptée';
  exception when check_violation then
    raise notice '  ok — refusé : une sous-classe';
  end;

  begin
    insert into public.loge_secteur (loge_id, code, nombre) values (loge, '56', 0);
    raise exception 'ÉCHEC — un décompte nul est entré';
  exception when check_violation then
    raise notice '  ok — refusé : zéro membre (c''est l''absence de ligne)';
  end;

  begin
    insert into public.loge_secteur (loge_id, code, nombre) values (loge, '56', 1000);
    raise exception 'ÉCHEC — mille membres sont entrés';
  exception when check_violation then
    raise notice '  ok — refusé : mille membres, une faute de frappe';
  end;

  begin
    insert into public.loge_secteur (loge_id, code, nombre) values (loge, '43', 5);
    raise exception 'ÉCHEC — la même division est comptée deux fois';
  exception when unique_violation then
    raise notice '  ok — refusé : la même division deux fois';
  end;
end
$$;

\echo '— la date suit le décompte'
update public.loge set secteurs_maj_le = now() - interval '1 year' where id = :'loge_a';
update public.loge_secteur set nombre = 4 where loge_id = :'loge_a' and code = '43';
select public.verifier(
  (select secteurs_maj_le > now() - interval '1 hour' from public.loge where id = :'loge_a'),
  'une correction rajeunit la date');

update public.loge set secteurs_maj_le = now() - interval '1 year' where id = :'loge_a';
delete from public.loge_secteur where loge_id = :'loge_a' and code = '86';
select public.verifier(
  (select secteurs_maj_le > now() - interval '1 hour' from public.loge where id = :'loge_a'),
  'un retrait aussi — il ne laisse pas de ligne, la loge garde la date');

update public.loge set secteurs_maj_le = now() - interval '1 year' where id in (:'loge_a', :'loge_b');
update public.loge_secteur set loge_id = :'loge_b' where loge_id = :'loge_a' and code = '43';
select public.verifier(
  (select bool_and(secteurs_maj_le > now() - interval '1 hour')
     from public.loge where id in (:'loge_a', :'loge_b')),
  'une ligne qui change de loge date les deux loges, la quittée comme l''accueillante');

\echo '— supprimer la loge emporte son décompte'
delete from public.loge where id = :'loge_b';
select public.verifier(
  not exists (select 1 from public.loge_secteur where loge_id = :'loge_b'),
  'plus aucune ligne pour la loge supprimée');

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
    raise exception 'ÉCHEC — une session connectée lit les décomptes';
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
    raise exception 'ÉCHEC — une personne non connectée lit les décomptes';
  exception when insufficient_privilege then
    raise notice '  ok — une personne non connectée ne lit rien';
  end;
end
$$;

-- --- Ménage ----------------------------------------------------------------
delete from public.loge where id = :'loge_a';

\o
\echo '0089 — les secteurs de la loge : tout est vert.'
