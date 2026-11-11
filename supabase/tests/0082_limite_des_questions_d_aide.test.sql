-- Tests de la migration 0082_limite_des_questions_d_aide.sql.
--
--   · Rita et Rémi sont référents ; Carl a un compte de candidat
--   · dix questions par quart d'heure et par personne, pas une de plus

\set ON_ERROR_STOP on
\o /dev/null

\set rita 'cdcdcdcd-8200-0000-0000-000000000001'
\set remi 'cdcdcdcd-8200-0000-0000-000000000002'
\set carl 'cdcdcdcd-8200-0000-0000-000000000003'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'rita', 'rita0082@example.org', '{"role":"referent"}'),
  (:'remi', 'remi0082@example.org', '{"role":"referent"}'),
  (:'carl', 'carl0082@example.org', '{"role":"chercheur"}');

-- ---------------------------------------------------------------------------
\echo '— la table ne garde que qui et quand, jamais la question'
-- ---------------------------------------------------------------------------
select public.verifier(
  (select array_agg(column_name::text order by ordinal_position)
     from information_schema.columns
    where table_schema = 'public' and table_name = 'aide_question')
  = array['id', 'profil_id', 'posee_le'],
  'trois colonnes : id, profil_id, posee_le — aucun texte');

select public.verifier(
  (select relrowsecurity from pg_class where oid = 'public.aide_question'::regclass),
  'la RLS est activee');

select public.verifier(
  not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'aide_question'),
  'aucune policy : la table est fermee a tous');

-- ---------------------------------------------------------------------------
\echo '— dix questions passent, la onzieme non'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cdcdcdcd-8200-0000-0000-000000000001"}';
  select public.verifier(
    (select bool_and(public.compter_une_question_d_aide()) from generate_series(1, 10)),
    'les dix premieres questions de Rita passent');
  select public.verifier(not public.compter_une_question_d_aide(),
    'la onzieme est refusee');
  select public.verifier(not public.compter_une_question_d_aide(),
    'et la douzieme aussi');
commit;

select public.verifier(
  (select count(*) from public.aide_question where profil_id = :'rita') = 10,
  'un refus n ecrit rien : dix lignes pour Rita, pas douze');

-- ---------------------------------------------------------------------------
\echo '— la limite est par personne'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cdcdcdcd-8200-0000-0000-000000000002"}';
  select public.verifier(public.compter_une_question_d_aide(),
    'Remi passe alors que Rita est au plafond');
commit;

-- ---------------------------------------------------------------------------
\echo '— elle tient entre deux appels, et se rouvre apres un quart d heure'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cdcdcdcd-8200-0000-0000-000000000001"}';
  select public.verifier(not public.compter_une_question_d_aide(),
    'dans une autre transaction, Rita est toujours refusee : le compte est en base');
commit;

update public.aide_question
   set posee_le = now() - interval '16 minutes'
 where profil_id = :'rita';

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cdcdcdcd-8200-0000-0000-000000000001"}';
  select public.verifier(public.compter_une_question_d_aide(),
    'seize minutes plus tard, Rita repasse');
commit;

-- ---------------------------------------------------------------------------
\echo '— le menage : rien de plus vieux qu un jour'
-- ---------------------------------------------------------------------------
update public.aide_question
   set posee_le = now() - interval '2 days'
 where profil_id = :'rita' and posee_le < now() - interval '15 minutes';

select public.verifier(
  (select count(*) from public.aide_question where posee_le < now() - interval '1 day') = 10,
  'dix lignes vieilles de deux jours attendent');

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cdcdcdcd-8200-0000-0000-000000000002"}';
  select public.verifier(public.compter_une_question_d_aide(), 'Remi pose une question');
commit;

select public.verifier(
  not exists (select 1 from public.aide_question where posee_le < now() - interval '1 day'),
  'son passage a efface les lignes de plus d un jour, celles de Rita comprises');

-- ---------------------------------------------------------------------------
\echo '— ni un compte de candidat, ni un inconnu'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cdcdcdcd-8200-0000-0000-000000000003"}';
  select public.verifier(not public.compter_une_question_d_aide(),
    'Carl, candidat, est refuse');
commit;

select public.verifier(
  not exists (select 1 from public.aide_question where profil_id = :'carl'),
  'et rien n est ecrit pour lui');

begin;
  set local role authenticated;
  set local request.jwt.claims = '{}';
  select public.verifier(not public.compter_une_question_d_aide(),
    'sans identite, c est non');
commit;

-- ---------------------------------------------------------------------------
\echo '— la table reste fermee, meme a qui peut compter'
-- ---------------------------------------------------------------------------
do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"cdcdcdcd-8200-0000-0000-000000000001"}', true);
  begin
    perform 1 from public.aide_question;
    raise exception 'ÉCHEC — un referent lit la table des questions';
  exception when insufficient_privilege then
    raise notice '  ok — un referent ne lit pas la table';
  end;
  begin
    insert into public.aide_question (profil_id) values ('cdcdcdcd-8200-0000-0000-000000000001');
    raise exception 'ÉCHEC — un referent ecrit dans la table des questions';
  exception when insufficient_privilege then
    raise notice '  ok — ni n y ecrit';
  end;
  begin
    delete from public.aide_question;
    raise exception 'ÉCHEC — un referent vide la table pour remettre son compteur a zero';
  exception when insufficient_privilege then
    raise notice '  ok — ni ne la vide';
  end;
end
$$;

do $$
begin
  perform set_config('role', 'anon', true);
  begin
    perform public.compter_une_question_d_aide();
    raise exception 'ÉCHEC — anon compte une question';
  exception when insufficient_privilege then
    raise notice '  ok — anon n appelle pas la fonction';
  end;
end
$$;

\o
\echo '0082 — la limite des questions d aide : tout est vert.'
