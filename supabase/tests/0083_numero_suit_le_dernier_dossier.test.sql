-- Tests de la migration 0083_numero_suit_le_dernier_dossier.sql.
--
--   · Nora   référente à Nice-0083 — le dernier dossier y porte le 860, et le
--            compteur de la loge, resté en avance, dit 900
--   · Omar   référent à Orange-0083 — une loge sans aucun dossier, dont le
--            compteur dit pourtant 12

\set ON_ERROR_STOP on
\o /dev/null

\set nora 'aaaaaaaa-8300-0000-0000-000000000001'
\set omar 'aaaaaaaa-8300-0000-0000-000000000002'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'nora', 'nora0083@example.org', '{"role":"referent","nom":"Nora","prenom":"N"}'),
  (:'omar', 'omar0083@example.org', '{"role":"referent","nom":"Omar","prenom":"O"}')
on conflict do nothing;

insert into public.loge (bubble_id, nom, prochain_numero_candidat) values
  ('loge-0083-nice',   'Nice — 0083',   900),
  ('loge-0083-orange', 'Orange — 0083', 12)
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, email, loge_id) values
  ('ref-0083-nora', :'nora', 'Nora', 'N', 'nora0083@example.org',
   (select id from public.loge where bubble_id = 'loge-0083-nice')),
  ('ref-0083-omar', :'omar', 'Omar', 'O', 'omar0083@example.org',
   (select id from public.loge where bubble_id = 'loge-0083-orange'))
on conflict do nothing;

insert into public.candidat (bubble_id, numero, nom, prenom, loge_id) values
  ('cand-0083-859', 859, 'AVANT', 'Dernier',
   (select id from public.loge where bubble_id = 'loge-0083-nice')),
  ('cand-0083-860', 860, 'DERNIER', 'Dossier',
   (select id from public.loge where bubble_id = 'loge-0083-nice'))
on conflict do nothing;

-- Ce que fait la corbeille (0062) pour un dossier ouvert dans HERACLES, réduit
-- à ce qui compte ici : l'invitation part d'abord, le dossier ensuite.
create or replace function pg_temp.retirer(cible uuid) returns void
language sql as $$
  delete from public.parrainage where candidat_id = cible;
  delete from public.candidat where id = cible;
$$;

-- ---------------------------------------------------------------------------
\echo '— le numero suit le dernier dossier, et non le compteur'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-8300-0000-0000-000000000001"}';
  select public.inviter_un_candidat('a0083@example.org', encode(sha256('jeton-0083-a'::bytea), 'hex')) as premier \gset
commit;

select public.verifier(
  (:'premier'::jsonb ->> 'numero')::integer = 861,
  'après le 860, le 861 — le compteur resté à 900 n''entre plus dans le calcul');

select public.verifier(
  (select numero from public.candidat where id = (:'premier'::jsonb ->> 'candidat_id')::uuid) = 861,
  'le dossier porte bien le numéro annoncé');

select public.verifier(
  (select prochain_numero_candidat from public.loge where bubble_id = 'loge-0083-nice') = 861,
  'le compteur de la loge redescend sur le dernier numéro donné');

-- ---------------------------------------------------------------------------
\echo '— un dernier dossier supprime rend son numero'
-- ---------------------------------------------------------------------------
select pg_temp.retirer((:'premier'::jsonb ->> 'candidat_id')::uuid);

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-8300-0000-0000-000000000001"}';
  select public.inviter_un_candidat('b0083@example.org', encode(sha256('jeton-0083-b'::bytea), 'hex')) as second \gset
  select public.inviter_un_candidat('c0083@example.org', encode(sha256('jeton-0083-c'::bytea), 'hex')) as troisieme \gset
commit;

select public.verifier(
  (:'second'::jsonb ->> 'numero')::integer = 861,
  'le 861 supprimé est redonné au candidat suivant');

select public.verifier(
  (:'troisieme'::jsonb ->> 'numero')::integer = 862,
  'et la suite reprend : 862');

-- ---------------------------------------------------------------------------
\echo '— un dossier supprime au milieu laisse son trou'
-- ---------------------------------------------------------------------------
select pg_temp.retirer((:'second'::jsonb ->> 'candidat_id')::uuid);

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-8300-0000-0000-000000000001"}';
  select public.inviter_un_candidat('d0083@example.org', encode(sha256('jeton-0083-d'::bytea), 'hex')) as quatrieme \gset
commit;

select public.verifier(
  (:'quatrieme'::jsonb ->> 'numero')::integer = 863,
  'le 861 retiré sous le 862 n''est pas redonné : personne n''est renuméroté');

select public.verifier(
  (select count(*) = count(distinct numero) from public.candidat
    where loge_id = (select id from public.loge where bubble_id = 'loge-0083-nice')),
  'aucun numéro en double dans la loge');

-- ---------------------------------------------------------------------------
\echo '— une loge sans dossier commence a 1'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-8300-0000-0000-000000000002"}';
  select public.inviter_un_candidat('e0083@example.org', encode(sha256('jeton-0083-e'::bytea), 'hex')) as ailleurs \gset
commit;

select public.verifier(
  (:'ailleurs'::jsonb ->> 'numero')::integer = 1,
  'sans aucun dossier, le premier porte le 1, quoi que dise le compteur (12)');

select public.verifier(
  (select max(numero) from public.candidat
    where loge_id = (select id from public.loge where bubble_id = 'loge-0083-nice')) = 863,
  'chaque loge a sa suite : celle de Nice n''a pas bougé');

-- ---------------------------------------------------------------------------
\echo '— le calcul ne s appelle pas de l exterieur'
-- ---------------------------------------------------------------------------
do $$
declare
  le_role text;
begin
  foreach le_role in array array['anon', 'authenticated', 'service_role'] loop
    execute format('set local role %I', le_role);
    begin
      perform public.numero_du_prochain_candidat(
        (select id from public.loge where bubble_id = 'loge-0083-nice'));
      raise exception 'ÉCHEC — % a appelé le calcul du numéro', le_role;
    exception when insufficient_privilege then
      raise notice '  ok — % ne peut pas appeler le calcul du numéro', le_role;
    end;
    reset role;
  end loop;
end
$$;

select public.verifier(
  (select prochain_numero_candidat from public.loge where bubble_id = 'loge-0083-nice') = 863,
  'et ces tentatives n''ont consommé aucun numéro');

\o
\echo 'Tous les contrôles de 0083_numero_suit_le_dernier_dossier.sql sont passés.'
