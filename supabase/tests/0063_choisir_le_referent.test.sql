-- Tests de la migration 0063_choisir_le_referent.sql.
--
--   · Véra   Vénérable Maître à Paris-0063 — change le référent de tous les
--            candidats de Paris
--   · Ana    référente à Paris-0063      — garde les gestes de 0057
--   · Ben    référent à Paris-0063       — idem
--   · Rex    Secrétaire à Rennes-0063    — ne voit rien de Paris
--   · Zoé    administratrice, sans fiche ni loge — agit partout
--
-- Candidats : C1 suivi par Ana (repris de Bubble), C2 sans référent, C3 suivi
-- par Ben, C4 à Rennes.

\set ON_ERROR_STOP on
\o /dev/null

\set vera 'aaaaaaaa-6363-0000-0000-000000000001'
\set ana  'aaaaaaaa-6363-0000-0000-000000000002'
\set ben  'aaaaaaaa-6363-0000-0000-000000000003'
\set rex  'aaaaaaaa-6363-0000-0000-000000000004'
\set zoe  'aaaaaaaa-6363-0000-0000-000000000005'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'vera', 'vera0063@example.org', '{"role":"referent","nom":"Véra","prenom":"V"}'),
  (:'ana',  'ana0063@example.org',  '{"role":"referent","nom":"Ana","prenom":"A"}'),
  (:'ben',  'ben0063@example.org',  '{"role":"referent","nom":"Ben","prenom":"B"}'),
  (:'rex',  'rex0063@example.org',  '{"role":"referent","nom":"Rex","prenom":"R"}'),
  (:'zoe',  'zoe0063@example.org',  '{"role":"admin"}')
on conflict do nothing;

update public.profil set role = 'admin' where id = :'zoe';

insert into public.loge (bubble_id, nom) values
  ('loge-0063-paris',  'Paris — 0063'),
  ('loge-0063-rennes', 'Rennes — 0063')
on conflict do nothing;

select id as paris  from public.loge where bubble_id = 'loge-0063-paris'  \gset
select id as rennes from public.loge where bubble_id = 'loge-0063-rennes' \gset

insert into public.referent (bubble_id, profil_id, nom, prenom, email, college, loge_id) values
  ('ref-0063-vera', :'vera', 'Véra', 'V', 'vera0063@example.org', 'Vénérable Maître', :'paris'),
  ('ref-0063-ana',  :'ana',  'Ana',  'A', 'ana0063@example.org',  null,               :'paris'),
  ('ref-0063-ben',  :'ben',  'Ben',  'B', 'ben0063@example.org',  'Trésorier',        :'paris'),
  ('ref-0063-rex',  :'rex',  'Rex',  'R', 'rex0063@example.org',  'Secrétaire',       :'rennes')
on conflict do nothing;

select id as r_vera from public.referent where bubble_id = 'ref-0063-vera' \gset
select id as r_ana  from public.referent where bubble_id = 'ref-0063-ana'  \gset
select id as r_ben  from public.referent where bubble_id = 'ref-0063-ben'  \gset
select id as r_rex  from public.referent where bubble_id = 'ref-0063-rex'  \gset

\set c1 'cccccccc-6363-0000-0000-000000000001'
\set c2 'cccccccc-6363-0000-0000-000000000002'
\set c3 'cccccccc-6363-0000-0000-000000000003'
\set c4 'cccccccc-6363-0000-0000-000000000004'

-- C1 vient de Bubble : son référent y est aussi noté, par l'identifiant Bubble.
insert into public.candidat (id, bubble_id, loge_id, numero, nom, prenom, referent_id, referent_bubble_id) values
  (:'c1', 'cand-0063-1', :'paris', 631, 'Un',     'C', :'r_ana', 'ref-0063-ana')
on conflict do nothing;
insert into public.candidat (id, loge_id, numero, nom, prenom, referent_id) values
  (:'c2', :'paris',  632, 'Deux',   'C', null),
  (:'c3', :'paris',  633, 'Trois',  'C', :'r_ben'),
  (:'c4', :'rennes', 634, 'Quatre', 'C', :'r_rex')
on conflict do nothing;

-- ---------------------------------------------------------------------------
\echo '— le menu ne se montre que là où le geste réussira'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-6363-0000-0000-000000000003"}';
  select public.verifier(
    (select je_peux_choisir from public.designation_du_candidat(:'c1'::uuid)) = false,
    'Ben ne peut pas changer le référent du candidat d''Ana');
  select public.verifier(
    (select je_peux_choisir from public.designation_du_candidat(:'c2'::uuid)),
    'Ben peut prendre un candidat sans référent');
  select public.verifier(
    (select je_peux_choisir from public.designation_du_candidat(:'c3'::uuid)),
    'Ben peut passer le sien à un collègue');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-6363-0000-0000-000000000001"}';
  select public.verifier(
    (select je_peux_choisir and referent_id = :'r_ana'::uuid
       from public.designation_du_candidat(:'c1'::uuid)),
    'la Vénérable peut changer celui d''Ana, et le menu s''ouvre sur Ana');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-6363-0000-0000-000000000004"}';
  select public.verifier(
    (select count(*) from public.designation_du_candidat(:'c1'::uuid)) = 0,
    'le Secrétaire de Rennes ne voit rien d''un candidat de Paris');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-6363-0000-0000-000000000005"}';
  select public.verifier(
    (select je_peux_choisir from public.designation_du_candidat(:'c4'::uuid)),
    'l''administratrice, sans loge, peut choisir à Rennes');
commit;

-- ---------------------------------------------------------------------------
\echo '— les gestes de 0057 tiennent toujours'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-6363-0000-0000-000000000003"}';
  select public.verifier(
    public.designer_le_referent(:'c1'::uuid, :'r_ben'::uuid) = false,
    'Ben ne retire pas son candidat à Ana');
  select public.verifier(
    public.designer_le_referent(:'c3'::uuid, :'r_ana'::uuid),
    'Ben passe le sien à Ana');
commit;

select public.verifier(
  (select referent_id = :'r_ana'::uuid and referent_choisi_le is not null
     from public.candidat where id = :'c3'::uuid),
  'C3 est à Ana, et le choix est daté');
select public.verifier(
  (select referent_id = :'r_ana'::uuid from public.candidat where id = :'c1'::uuid),
  'C1 est toujours à Ana');

-- ---------------------------------------------------------------------------
\echo '— le bureau reporte la decision de la commission'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-6363-0000-0000-000000000001"}';
  select public.verifier(
    public.designer_le_referent(:'c1'::uuid, :'r_ben'::uuid),
    'la Vénérable confie à Ben le candidat d''Ana');
commit;

select referent_choisi_le as date_du_choix from public.candidat where id = :'c1'::uuid \gset

select public.verifier(
  (select referent_id = :'r_ben'::uuid from public.candidat where id = :'c1'::uuid),
  'C1 est à Ben');

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-6363-0000-0000-000000000001"}';
  select public.verifier(
    public.designer_le_referent(:'c1'::uuid, :'r_ben'::uuid),
    'choisir le même référent répond oui');
commit;

select public.verifier(
  (select referent_choisi_le = :'date_du_choix'::timestamptz from public.candidat where id = :'c1'::uuid),
  'et ne change pas la date du choix');

-- Un référent d'une autre loge : la base refuse, et le dit. L'identifiant de
-- Rex est lu avant de changer d'identité : sous celle de la Vénérable, la RLS
-- cache sa fiche, et la sous-requête rendrait un vide — que la fonction
-- comprendrait comme « moi ».
select set_config('test0063.rex', :'r_rex', false);

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-6363-0000-0000-000000000001"}', true);
  perform public.designer_le_referent('cccccccc-6363-0000-0000-000000000002',
    current_setting('test0063.rex')::uuid);
  raise exception 'ÉCHEC — un référent de Rennes a été donné à un candidat de Paris';
exception
  when foreign_key_violation then
    raise notice '  ok — un référent d''une autre loge est refusé';
end
$$;
reset role;

-- ---------------------------------------------------------------------------
\echo '— l administratrice agit partout, mais doit nommer le referent'
-- ---------------------------------------------------------------------------
-- Une autre fiche de Rennes, pour que le changement soit réel.
insert into public.referent (bubble_id, nom, prenom, email, loge_id)
values ('ref-0063-rita', 'Rita', 'R', 'rita0063@example.org', :'rennes')
on conflict do nothing;
select id as r_rita from public.referent where bubble_id = 'ref-0063-rita' \gset

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-6363-0000-0000-000000000005"}';
  select public.verifier(
    public.designer_le_referent(:'c4'::uuid, :'r_rita'::uuid),
    'l''administratrice confie C4, à Rennes, à Rita');
commit;

select public.verifier(
  (select referent_id = :'r_rita'::uuid from public.candidat where id = :'c4'::uuid),
  'C4 est à Rita');

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-6363-0000-0000-000000000005"}', true);
  -- Sans référent nommé, « moi » ne veut rien dire : elle n'a pas de fiche.
  perform public.designer_le_referent('cccccccc-6363-0000-0000-000000000002');
  raise exception 'ÉCHEC — l''administratrice s''est désignée sans fiche';
exception
  when foreign_key_violation then
    raise notice '  ok — sans fiche, l''administratrice doit nommer le référent';
end
$$;
reset role;

-- ---------------------------------------------------------------------------
\echo '— la date du choix ne se modifie pas a la main'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-6363-0000-0000-000000000002"}';
  -- Ana suit C3 depuis plus haut : la RLS la laisse écrire sur la fiche.
  update public.candidat
     set referent_choisi_le = null, referent_id = :'r_ben'::uuid, ville = 'Paris'
   where id = :'c3'::uuid;
commit;

select public.verifier(
  (select referent_choisi_le is not null and referent_id = :'r_ana'::uuid and ville = 'Paris'
     from public.candidat where id = :'c3'::uuid),
  'une écriture directe garde le référent et sa date, et passe le reste');

-- ---------------------------------------------------------------------------
\echo '— la reprise Bubble ne defait plus un choix fait ici'
-- ---------------------------------------------------------------------------
-- La requête de la passe 2 de `outils/import-bubble.mjs`, telle que la
-- produit le lien `candidat.referent_bubble_id` avec sa garde.
insert into public.candidat (id, bubble_id, loge_id, numero, nom, prenom, referent_bubble_id) values
  ('cccccccc-6363-0000-0000-000000000005', 'cand-0063-5', :'paris', 635, 'Cinq', 'C', 'ref-0063-ana')
on conflict do nothing;

update public.candidat t
   set referent_id = c.id
  from public.referent c
 where c.bubble_id = t.referent_bubble_id
   and t.referent_id is distinct from c.id
   and t.referent_choisi_le is null;

select public.verifier(
  (select referent_id = :'r_ben'::uuid from public.candidat where id = :'c1'::uuid),
  'C1 reste à Ben, alors que Bubble le donne à Ana');
select public.verifier(
  (select referent_id = :'r_ana'::uuid
     from public.candidat where id = 'cccccccc-6363-0000-0000-000000000005'),
  'un dossier jamais choisi ici suit toujours Bubble');

\echo ''
\echo 'Tous les contrôles de 0063_choisir_le_referent.sql sont passés.'
