-- Tests de la migration 0084_numero_unique_par_loge.sql.
--
--   · Pia   référente à Paris-0084 — le dernier dossier venu de Bubble y porte
--           le 860, et elle ouvre le 861 dans HERACLES
--   · une seconde loge, Quimper-0084, qui a sa propre suite
--
-- Ce fichier joue ce que fait la reprise Bubble : suspendre, écrire, rétablir.

\set ON_ERROR_STOP on
\o /dev/null

\set pia 'aaaaaaaa-8400-0000-0000-000000000001'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'pia', 'pia0084@example.org', '{"role":"referent","nom":"Pia","prenom":"P"}')
on conflict do nothing;

insert into public.loge (bubble_id, nom) values
  ('loge-0084-paris',   'Paris — 0084'),
  ('loge-0084-quimper', 'Quimper — 0084')
on conflict do nothing;

select id as l_paris   from public.loge where bubble_id = 'loge-0084-paris'   \gset
select id as l_quimper from public.loge where bubble_id = 'loge-0084-quimper' \gset

insert into public.referent (bubble_id, profil_id, nom, prenom, email, loge_id) values
  ('ref-0084-pia', :'pia', 'Pia', 'P', 'pia0084@example.org', :'l_paris')
on conflict do nothing;

insert into public.candidat (bubble_id, numero, nom, prenom, loge_id) values
  ('cand-0084-860', 860, 'BUBBLE', 'Dernier', :'l_paris')
on conflict do nothing;

-- ---------------------------------------------------------------------------
\echo '— l unicite est en place apres les migrations'
-- ---------------------------------------------------------------------------
select public.verifier(
  exists (select 1 from pg_indexes
           where schemaname = 'public' and indexname = 'candidat_numero_par_loge_unique'),
  'l''index d''unicité existe');

do $$
begin
  begin
    insert into public.candidat (numero, nom, prenom, loge_id)
    values (860, 'DOUBLON', 'Essai', (select id from public.loge where bubble_id = 'loge-0084-paris'));
    raise exception 'ÉCHEC — un second 860 a été accepté dans la même loge';
  exception when unique_violation then
    raise notice '  ok — un second 860 dans la même loge est refusé';
  end;
end
$$;

insert into public.candidat (bubble_id, numero, nom, prenom, loge_id) values
  ('cand-0084-q860', 860, 'AILLEURS', 'Dossier', :'l_quimper');

select public.verifier(
  (select count(*) from public.candidat where numero = 860
      and loge_id in (:'l_paris'::uuid, :'l_quimper'::uuid)) = 2,
  'le même numéro dans une autre loge reste permis : chaque loge a sa suite');

insert into public.candidat (nom, prenom, numero, loge_id) values
  ('SANS', 'Loge', 860, null), ('SANS', 'Loge bis', 860, null);
insert into public.candidat (nom, prenom, numero, loge_id) values
  ('SANS', 'Numéro', null, :'l_paris'), ('SANS', 'Numéro bis', null, :'l_paris');

select public.verifier(true, 'un dossier sans loge, ou sans numéro, n''entre pas dans la règle');

delete from public.candidat where nom = 'SANS' and prenom like 'Loge%';
delete from public.candidat where nom = 'SANS' and prenom like 'Numéro%';

-- ---------------------------------------------------------------------------
\echo '— Bubble prend le 861 deja ouvert dans HERACLES : Bubble garde'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-8400-0000-0000-000000000001"}';
  select (public.inviter_un_candidat('a0084@example.org',
            encode(sha256('jeton-0084-a'::bytea), 'hex')) ->> 'candidat_id') as ouvert \gset
  select (public.inviter_un_candidat('b0084@example.org',
            encode(sha256('jeton-0084-b'::bytea), 'hex')) ->> 'candidat_id') as ouvert_bis \gset
commit;

select public.verifier(
  (select numero from public.candidat where id = :'ouvert'::uuid) = 861
    and (select numero from public.candidat where id = :'ouvert_bis'::uuid) = 862,
  'HERACLES a ouvert le 861 et le 862');

-- La reprise : elle suspend, écrit le dossier de Bubble sans loge, puis le
-- rattache — c'est ce rattachement que l'index aurait arrêté.
select public.suspendre_l_unicite_des_numeros();

insert into public.candidat (bubble_id, numero, nom, prenom, loge_bubble_id) values
  ('cand-0084-861', 861, 'BUBBLE', 'Nouveau', 'loge-0084-paris');
update public.candidat set loge_id = :'l_paris' where bubble_id = 'cand-0084-861';

select renumerotes, doublons_restants, unicite
  from public.retablir_l_unicite_des_numeros() \gset

select public.verifier(
  :renumerotes = 1 and :doublons_restants = 0 and :'unicite'::boolean,
  'un dossier renuméroté, aucun doublon restant, unicité rétablie');

select public.verifier(
  (select numero from public.candidat where bubble_id = 'cand-0084-861') = 861,
  'le dossier venu de Bubble garde le 861');

select public.verifier(
  (select numero from public.candidat where id = :'ouvert'::uuid) = 863,
  'le dossier ouvert dans HERACLES passe à la suite de sa loge : 863');

select public.verifier(
  (select numero from public.candidat where id = :'ouvert_bis'::uuid) = 862,
  'le 862, que personne ne disputait, n''a pas bougé');

select public.verifier(
  exists (select 1 from pg_indexes
           where schemaname = 'public' and indexname = 'candidat_numero_par_loge_unique'),
  'l''index est reposé');

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-8400-0000-0000-000000000001"}';
  select (public.inviter_un_candidat('c0084@example.org',
            encode(sha256('jeton-0084-c'::bytea), 'hex')) ->> 'numero') as suivant \gset
commit;

select public.verifier(:suivant = 864, 'et le candidat suivant reçoit le 864');

-- ---------------------------------------------------------------------------
\echo '— rejouer ne change rien'
-- ---------------------------------------------------------------------------
select renumerotes, doublons_restants, unicite
  from public.retablir_l_unicite_des_numeros() \gset

select public.verifier(
  :renumerotes = 0 and :doublons_restants = 0 and :'unicite'::boolean,
  'un second passage ne renumérote personne');

-- ---------------------------------------------------------------------------
\echo '— un doublon dans Bubble lui-meme : l index attend, la reprise continue'
-- ---------------------------------------------------------------------------
select public.suspendre_l_unicite_des_numeros();

insert into public.candidat (bubble_id, numero, nom, prenom, loge_id) values
  ('cand-0084-860-bis', 860, 'BUBBLE', 'Doublon', :'l_paris');

select renumerotes, doublons_restants, unicite
  from public.retablir_l_unicite_des_numeros() \gset

select public.verifier(
  :renumerotes = 0 and :doublons_restants = 1 and not :'unicite'::boolean,
  'deux dossiers de Bubble sous le 860 : personne n''est renuméroté, et c''est dit');

select public.verifier(
  not exists (select 1 from pg_indexes
               where schemaname = 'public' and indexname = 'candidat_numero_par_loge_unique'),
  'l''index n''est pas posé tant que le doublon existe');

select public.verifier(
  (select count(*) from public.candidat where loge_id = :'l_paris'::uuid and numero = 860) = 2,
  'les deux dossiers de Bubble sont là, intacts');

-- Le doublon disparaît (corrigé dans Bubble, puis repris) : l'unicité revient
-- d'elle-même au passage suivant.
delete from public.candidat where bubble_id = 'cand-0084-860-bis';

select public.verifier(
  (select unicite from public.retablir_l_unicite_des_numeros()),
  'le doublon parti, l''unicité revient au passage suivant');

-- ---------------------------------------------------------------------------
\echo '— suspendre et retablir ne s appellent pas de l exterieur'
-- ---------------------------------------------------------------------------
do $$
declare
  le_role text;
begin
  foreach le_role in array array['anon', 'authenticated', 'service_role'] loop
    execute format('set local role %I', le_role);
    begin
      perform public.suspendre_l_unicite_des_numeros();
      raise exception 'ÉCHEC — % a suspendu l''unicité', le_role;
    exception when insufficient_privilege then
      raise notice '  ok — % ne peut pas suspendre l''unicité', le_role;
    end;
    begin
      perform * from public.retablir_l_unicite_des_numeros();
      raise exception 'ÉCHEC — % a appelé le rétablissement', le_role;
    exception when insufficient_privilege then
      raise notice '  ok — % ne peut pas appeler le rétablissement', le_role;
    end;
    reset role;
  end loop;
end
$$;

select public.verifier(
  exists (select 1 from pg_indexes
           where schemaname = 'public' and indexname = 'candidat_numero_par_loge_unique'),
  'à la fin, l''unicité est en place');

\o
\echo 'Tous les contrôles de 0084_numero_unique_par_loge.sql sont passés.'
