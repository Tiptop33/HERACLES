-- Tests de la migration 0119_effacement_des_pdf_reserve_a_l_administration.sql.
--
--   · Sara   Secrétaire à Agen-0119        — lit, n'efface plus
--   · Vito   Vénérable Maître à Agen-0119  — lit, n'efface plus
--   · Paul   sans titre à Agen-0119        — lit, n'efface pas (comme avant)
--   · Iris   administratrice, sans loge    — efface partout

\set ON_ERROR_STOP on
\o /dev/null

\set sara 'eeeeeeee-0119-0000-0000-000000000001'
\set vito 'eeeeeeee-0119-0000-0000-000000000002'
\set paul 'eeeeeeee-0119-0000-0000-000000000003'
\set iris 'eeeeeeee-0119-0000-0000-000000000004'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'sara', 'sara0119@example.org', '{"role":"referent"}'),
  (:'vito', 'vito0119@example.org', '{"role":"referent"}'),
  (:'paul', 'paul0119@example.org', '{"role":"referent"}'),
  (:'iris', 'iris0119@example.org', '{"role":"referent"}');

update public.profil set role = 'admin' where id = :'iris';

insert into public.loge (bubble_id, nom) values
  ('loge-0119-agen', 'Agen — 0119')
on conflict do nothing;

select id as l_agen from public.loge where bubble_id = 'loge-0119-agen' \gset

insert into public.referent (bubble_id, profil_id, nom, prenom, college, loge_id) values
  ('ref-0119-sara', :'sara', 'SAUVAGE', 'Sara', 'Secrétaire',       :'l_agen'::uuid),
  ('ref-0119-vito', :'vito', 'VERNET',  'Vito', 'Vénérable Maître', :'l_agen'::uuid),
  ('ref-0119-paul', :'paul', 'PONS',    'Paul', null,               :'l_agen'::uuid)
on conflict do nothing;

-- Deux PDF de la loge, produits par HERACLES, datés d'hier : leur fichier est
-- dans le seau (0070), donc l'accueil les montre.
insert into public.document (nom, type_document, chemin, loge_id, date_document) values
  ('Compte-Rendu 0119', 'compte-rendu', 'archives/0119/cr.pdf',      :'l_agen'::uuid, current_date - 1),
  ('Affiche 0119',      'affiche',      'archives/0119/affiche.pdf', :'l_agen'::uuid, current_date - 1);

select id as d_cr      from public.document where nom = 'Compte-Rendu 0119' \gset
select id as d_affiche from public.document where nom = 'Affiche 0119' \gset

-- ---------------------------------------------------------------------------
\echo '— le droit : l administration seule'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"eeeeeeee-0119-0000-0000-000000000001"}';
  select public.verifier(not public.puis_je_effacer_des_documents(),
    'la Secretaire n a plus le droit d effacer un PDF');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"eeeeeeee-0119-0000-0000-000000000002"}';
  select public.verifier(not public.puis_je_effacer_des_documents(),
    'le Venerable Maitre non plus');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"eeeeeeee-0119-0000-0000-000000000003"}';
  select public.verifier(not public.puis_je_effacer_des_documents(),
    'ni un referent sans titre, comme avant');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"eeeeeeee-0119-0000-0000-000000000004"}';
  select public.verifier(public.puis_je_effacer_des_documents(),
    'l administratrice, oui');
commit;

-- Le droit des réunions n'a pas bougé : les deux règles ont divergé.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"eeeeeeee-0119-0000-0000-000000000001"}';
  select public.verifier(public.puis_je_effacer_des_reunions(),
    'puis_je_effacer_des_reunions reste telle qu en 0041');
commit;

-- ---------------------------------------------------------------------------
\echo '— la corbeille : nulle part pour les titres, partout pour l administration'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"eeeeeeee-0119-0000-0000-000000000001"}';
  select public.verifier(
    (select count(*) from public.documents_de_l_accueil(current_date - 30, current_date)) = 2,
    'la Secretaire lit toujours les PDF de sa loge');
  select public.verifier(
    not exists (select 1 from public.documents_de_l_accueil(current_date - 30, current_date)
                 where effacable),
    'mais sans corbeille');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"eeeeeeee-0119-0000-0000-000000000002"}';
  select public.verifier(
    (select count(*) from public.documents_de_l_accueil(current_date - 30, current_date)) = 2,
    'le Venerable Maitre les lit aussi');
  select public.verifier(
    not exists (select 1 from public.documents_de_l_accueil(current_date - 30, current_date)
                 where effacable),
    'sans corbeille lui non plus');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"eeeeeeee-0119-0000-0000-000000000004"}';
  select public.verifier(
    (select bool_and(effacable)
       from public.documents_de_l_accueil(current_date - 30, current_date)
      where id in (:'d_cr'::uuid, :'d_affiche'::uuid)),
    'l administratrice a la corbeille sur les deux');
commit;

-- ---------------------------------------------------------------------------
\echo '— effacer : refuse aux titres, par un appel direct comme par l ecran'
-- ---------------------------------------------------------------------------
do $$
declare
  essais text[][] := array[
    ['eeeeeeee-0119-0000-0000-000000000001', 'la Secretaire'],
    ['eeeeeeee-0119-0000-0000-000000000002', 'le Venerable Maitre'],
    ['eeeeeeee-0119-0000-0000-000000000003', 'un referent sans titre']
  ];
  e     text[];
  cible uuid := (select id from public.document where nom = 'Compte-Rendu 0119');
begin
  set local role authenticated;
  foreach e slice 1 in array essais loop
    perform set_config('request.jwt.claims', json_build_object('sub', e[1])::text, true);
    begin
      perform public.effacer_un_document(cible);
      raise exception 'ÉCHEC — % a efface un PDF de sa loge', e[2];
    exception when insufficient_privilege then
      raise notice '  ok — % n efface pas', e[2];
    end;
  end loop;
end
$$;

select public.verifier(
  (select count(*) from public.document
    where id in (:'d_cr'::uuid, :'d_affiche'::uuid) and efface_le is null) = 2,
  'les deux PDF sont toujours la');

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"eeeeeeee-0119-0000-0000-000000000004"}';
  select public.verifier(
    (select chemin from public.effacer_un_document(:'d_cr'::uuid)) = 'archives/0119/cr.pdf',
    'l administratrice efface, et recoit le fichier a retirer du seau');
commit;

select public.verifier(
  not exists (select 1 from public.document where id = :'d_cr'::uuid),
  'le compte rendu a quitte la base');
select public.verifier(
  exists (select 1 from public.document where id = :'d_affiche'::uuid and efface_le is null),
  'l affiche, elle, est intacte');

\o
\echo '0119 : effacer un PDF est reserve a l administration.'
