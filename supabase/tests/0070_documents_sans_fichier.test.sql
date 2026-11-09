-- Tests de la migration 0070_documents_sans_fichier.sql.
--
--   · Rose   Secrétaire à Brest-0070
--
-- Trois PDF de Bubble dans la période : un rapatrié, un pas encore, un que
-- Bubble refuse (il reste sans fichier). Seul le premier se montre.

\set ON_ERROR_STOP on
\o /dev/null

\set rose 'ffffffff-7000-0000-0000-000000000001'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'rose', 'rose0070@example.org', '{"role":"referent"}');

insert into public.loge (bubble_id, nom) values ('loge-0070-brest', 'Brest — 0070')
on conflict do nothing;
select id as l_brest from public.loge where bubble_id = 'loge-0070-brest' \gset

insert into public.referent (bubble_id, profil_id, nom, prenom, college, loge_id) values
  ('ref-0070-rose', :'rose', 'ROUX', 'Rose', 'Secrétaire', :'l_brest'::uuid)
on conflict do nothing;

insert into public.document
  (bubble_id, nom, type_document, lien_url, chemin, loge_id, date_document) values
  ('pdf-0070-a', 'Affiche rapatriée', 'affiche', 'https://example.org/a.pdf',
   'document/pdf-0070-a/a.pdf', :'l_brest'::uuid, date '2026-10-14'),
  ('pdf-0070-b', 'Affiche pas encore rapatriée', 'affiche', 'https://example.org/b.pdf',
   null, :'l_brest'::uuid, date '2026-10-14'),
  ('pdf-0070-c', 'Affiche refusée par Bubble', 'affiche', 'https://example.org/c.pdf',
   null, :'l_brest'::uuid, date '2026-03-26');

-- ---------------------------------------------------------------------------
\echo '— un lien ne se montre que s il s ouvre'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ffffffff-7000-0000-0000-000000000001"}';

  select public.verifier(
    (select count(*) from public.documents_de_l_accueil(date '2026-09-01', date '2027-07-31')) = 1,
    'a l accueil, seule l affiche dont le fichier est chez nous');
  select public.verifier(
    (select nom from public.documents_de_l_accueil(date '2026-09-01', date '2027-07-31'))
      = 'Affiche rapatriée',
    'et c est bien celle-la');
  select public.verifier(
    (select count(*) from public.documents_de_l_accueil(date '1900-01-01', date '2026-08-31')) = 0,
    'aux archives, le PDF que Bubble refuse ne se montre pas non plus');
  select public.verifier(
    (select count(*) from public.document where loge_id = :'l_brest'::uuid) = 3,
    'mais rien n est efface : les trois fiches restent lisibles en base');
commit;

-- Le fichier arrive à la mise en ligne suivante : le PDF apparaît.
update public.document set chemin = 'document/pdf-0070-b/b.pdf' where bubble_id = 'pdf-0070-b';

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ffffffff-7000-0000-0000-000000000001"}';
  select public.verifier(
    (select count(*) from public.documents_de_l_accueil(date '2026-09-01', date '2027-07-31')) = 2,
    'un PDF rapatrie depuis apparait aussitot');
commit;

\o
\echo '0070 — les PDF sans fichier : tout est vert.'
