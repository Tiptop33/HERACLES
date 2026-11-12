-- Tests de la migration 0086_code_naf.sql.
--
-- Ce qu'on éprouve :
--   * la table porte le code, l'intitulé, le niveau et le parent, et le code
--     en est la clé ;
--   * la forme du code dépend du niveau, en majuscules et sans espace ;
--   * seule une section n'a pas de parent, et un parent est exactement un
--     niveau au-dessus ; sous la division, un code prolonge celui du parent ;
--   * un intitulé vide est refusé, un code ne se double pas ;
--   * la table est fermée : ni `anon` ni `authenticated` ne s'y adressent,
--     la clé de service la lit.
--
-- Données fabriquées : une branche qui n'existe pas dans la NAF — section
-- « Z », division « 00 » et ses descendants —, retirée à la fin.

\set ON_ERROR_STOP on
\o /dev/null

-- --- Structure -------------------------------------------------------------
\echo '— code, intitulé, niveau, parent ; le code pour clé'
select public.verifier(
  (select array_agg(column_name::text order by ordinal_position)
     from information_schema.columns
    where table_schema = 'public' and table_name = 'code_naf')
  = array['code', 'intitule', 'niveau', 'parent'],
  'la table porte code, intitule, niveau et parent');

select public.verifier(
  (select array_agg(a.attname::text)
     from pg_index i
     join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
    where i.indrelid = 'public.code_naf'::regclass and i.indisprimary)
  = array['code'],
  'le code est la clé primaire');

-- --- Une branche complète entre ---------------------------------------------
\echo '— une branche de cinq niveaux entre'
insert into public.code_naf (code, intitule, niveau, parent) values
  ('Z',      'Section d''essai 0086',     'section',     null),
  ('00',     'Division d''essai 0086',    'division',    'Z'),
  ('00.0',   'Groupe d''essai 0086',      'groupe',      '00'),
  ('00.00',  'Classe d''essai 0086',      'classe',      '00.0'),
  ('00.00Z', 'Sous-classe d''essai 0086', 'sous-classe', '00.00')
on conflict (code) do nothing;

select public.verifier(
  (select count(*) from public.code_naf where code in ('Z', '00', '00.0', '00.00', '00.00Z')) = 5,
  'section, division, groupe, classe et sous-classe');

-- --- Ce que la table refuse -------------------------------------------------
\echo '— ce que la table refuse'
do $$
declare
  essais text[][] := array[
    -- code,      niveau,        parent,  intitulé,   ce qu'on éprouve
    ['00.01z',  'sous-classe',  '00.00', 'Minuscule', 'un code en minuscules'],
    [' 00.01Z', 'sous-classe',  '00.00', 'Espace',    'un code entouré d''espaces'],
    ['',        'section',      null,    'Vide',      'un code vide'],
    ['01',      'section',      null,    'Forme',     'un code qui n''a pas la forme de son niveau'],
    ['00.01Z',  'sous-niveau',  '00.00', 'Niveau',    'un niveau inconnu'],
    ['Y',       'section',      'Z',     'Parent',    'une section qui aurait un parent'],
    ['01',      'division',     null,    'Orphelin',  'une division sans parent'],
    ['00.1',    'groupe',       '01',    'Prolonge',  'un groupe qui ne prolonge pas sa division'],
    ['00.01Z',  'sous-classe',  '00.00', '   ',       'un intitulé blanc']
  ];
  i int;
begin
  for i in 1 .. array_length(essais, 1) loop
    begin
      insert into public.code_naf (code, intitule, niveau, parent)
        values (essais[i][1], essais[i][4], essais[i][2], essais[i][3]);
      raise exception 'ÉCHEC — accepté : %', essais[i][5];
    exception when check_violation then
      raise notice '  ok — refusé : %', essais[i][5];
    end;
  end loop;

  begin
    insert into public.code_naf (code, intitule, niveau, parent)
      values ('01', 'Saut de niveau', 'division', '00');
    raise exception 'ÉCHEC — une division s''est rangée sous une division';
  exception when check_violation then
    raise notice '  ok — refusé : un parent qui n''est pas le niveau juste au-dessus';
  end;

  begin
    insert into public.code_naf (code, intitule, niveau, parent)
      values ('00.01', 'Parent absent', 'classe', '00.9');
    raise exception 'ÉCHEC — un parent absent est passé';
  exception when check_violation or foreign_key_violation then
    raise notice '  ok — refusé : un parent qui n''existe pas';
  end;

  begin
    insert into public.code_naf (code, intitule, niveau, parent)
      values ('Z', 'Doublon', 'section', null);
    raise exception 'ÉCHEC — un code s''est doublé';
  exception when unique_violation then
    raise notice '  ok — refusé : un code en double';
  end;

  begin
    insert into public.code_naf (code, intitule, niveau, parent)
      values ('00.01Z', null, 'sous-classe', '00.00');
    raise exception 'ÉCHEC — un intitulé absent est passé';
  exception when not_null_violation then
    raise notice '  ok — refusé : un intitulé absent';
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
    and not has_table_privilege('authenticated', 'public.code_naf', 'select')
    and not has_table_privilege('authenticated', 'public.code_naf', 'insert')
    and not has_table_privilege('authenticated', 'public.code_naf', 'update')
    and not has_table_privilege('authenticated', 'public.code_naf', 'delete'),
  'ni anon ni authenticated n''ont de droit sur la table');

do $$
begin
  set local role authenticated;
  begin
    perform 1 from public.code_naf limit 1;
    raise exception 'ÉCHEC — une session connectée lit la nomenclature';
  exception when insufficient_privilege then
    raise notice '  ok — une session connectée ne lit rien';
  end;
end
$$;

\echo '— la clé de service garde la main'
begin;
  set local role service_role;
  select public.verifier(
    (select intitule from public.code_naf where code = '00') = 'Division d''essai 0086',
    'la clé de service lit la table');
rollback;

-- --- Ménage ----------------------------------------------------------------
delete from public.code_naf where code = '00.00Z';
delete from public.code_naf where code = '00.00';
delete from public.code_naf where code = '00.0';
delete from public.code_naf where code = '00';
delete from public.code_naf where code = 'Z';

\o
\echo '0086 — la nomenclature NAF, sa table : tout est vert.'
