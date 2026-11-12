-- Tests de la migration 0086_code_naf.sql.
--
-- Ce qu'on éprouve :
--   * la table porte exactement deux colonnes, `code` et `intitule`, et le
--     code en est la clé ;
--   * un code se range en majuscules, sans espace autour, et ne se double pas ;
--   * un code ou un intitulé vide est refusé ;
--   * la table est fermée : RLS active, aucune policy, et ni `anon` ni
--     `authenticated` ne peuvent même s'y adresser ;
--   * la clé de service, elle, la lit et l'écrit.
--
-- Données fabriquées : deux codes d'exemple, retirés à la fin.

\set ON_ERROR_STOP on
\o /dev/null

-- --- Structure -------------------------------------------------------------
\echo '— deux colonnes, et le code pour clé'
select public.verifier(
  (select array_agg(column_name::text order by ordinal_position)
     from information_schema.columns
    where table_schema = 'public' and table_name = 'code_naf')
  = array['code', 'intitule'],
  'la table porte code et intitule, et rien d''autre');

select public.verifier(
  (select array_agg(a.attname::text)
     from pg_index i
     join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
    where i.indrelid = 'public.code_naf'::regclass and i.indisprimary)
  = array['code'],
  'le code est la clé primaire');

-- --- Ce que la table accepte -----------------------------------------------
\echo '— un code propre entre, un code mal rangé est refusé'
insert into public.code_naf (code, intitule) values
  ('99.99Z', 'Activité d''essai 0086'),
  ('Z',      'Section d''essai 0086')
on conflict (code) do nothing;

select public.verifier(
  (select count(*) from public.code_naf where code in ('99.99Z', 'Z')) = 2,
  'une sous-classe et une section entrent toutes deux');

do $$
begin
  begin
    insert into public.code_naf (code, intitule) values ('99.99Z', 'Doublon');
    raise exception 'ÉCHEC — un code s''est doublé';
  exception when unique_violation then
    raise notice '  ok — un code ne se double pas';
  end;

  begin
    insert into public.code_naf (code, intitule) values ('99.98z', 'Minuscule');
    raise exception 'ÉCHEC — un code en minuscules est entré';
  exception when check_violation then
    raise notice '  ok — un code en minuscules est refusé';
  end;

  begin
    insert into public.code_naf (code, intitule) values (' 99.98Z', 'Espace');
    raise exception 'ÉCHEC — un code entouré d''espaces est entré';
  exception when check_violation then
    raise notice '  ok — un code entouré d''espaces est refusé';
  end;

  begin
    insert into public.code_naf (code, intitule) values ('', 'Vide');
    raise exception 'ÉCHEC — un code vide est entré';
  exception when check_violation then
    raise notice '  ok — un code vide est refusé';
  end;

  begin
    insert into public.code_naf (code, intitule) values ('99.97Z', '   ');
    raise exception 'ÉCHEC — un intitulé blanc est entré';
  exception when check_violation then
    raise notice '  ok — un intitulé blanc est refusé';
  end;

  begin
    insert into public.code_naf (code, intitule) values ('99.97Z', null);
    raise exception 'ÉCHEC — un intitulé absent est entré';
  exception when not_null_violation then
    raise notice '  ok — un intitulé absent est refusé';
  end;
end
$$;

-- --- Fermée ----------------------------------------------------------------
\echo '— fermée par défaut'
select public.verifier(
  (select relrowsecurity from pg_class where oid = 'public.code_naf'::regclass),
  'la RLS est active');

select public.verifier(
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'code_naf') = 0,
  'aucune policy : aucun écran ne la lit encore');

select public.verifier(
  not has_table_privilege('anon', 'public.code_naf', 'select')
    and not has_table_privilege('anon', 'public.code_naf', 'insert')
    and not has_table_privilege('authenticated', 'public.code_naf', 'select')
    and not has_table_privilege('authenticated', 'public.code_naf', 'insert')
    and not has_table_privilege('authenticated', 'public.code_naf', 'update')
    and not has_table_privilege('authenticated', 'public.code_naf', 'delete'),
  'ni anon ni authenticated n''ont de droit sur la table');

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
                     '{"sub":"eeeeeeee-0086-0000-0000-000000000001"}', true);
  begin
    perform 1 from public.code_naf limit 1;
    raise exception 'ÉCHEC — une session connectée lit les codes NAF';
  exception when insufficient_privilege then
    raise notice '  ok — une session connectée ne lit rien';
  end;
end
$$;

do $$
begin
  set local role anon;
  begin
    perform 1 from public.code_naf limit 1;
    raise exception 'ÉCHEC — une personne non connectée lit les codes NAF';
  exception when insufficient_privilege then
    raise notice '  ok — une personne non connectée ne lit rien';
  end;
end
$$;

\echo '— la clé de service garde la main'
begin;
  set local role service_role;
  select public.verifier(
    (select intitule from public.code_naf where code = '99.99Z') = 'Activité d''essai 0086',
    'la clé de service lit la table');
  update public.code_naf set intitule = 'Activité d''essai 0086, corrigée'
   where code = '99.99Z';
  select public.verifier(
    (select intitule from public.code_naf where code = '99.99Z') = 'Activité d''essai 0086, corrigée',
    'la clé de service y écrit');
rollback;

-- --- Ménage ----------------------------------------------------------------
delete from public.code_naf where code in ('99.99Z', 'Z');

\o
\echo '0086 — les codes NAF : tout est vert.'
