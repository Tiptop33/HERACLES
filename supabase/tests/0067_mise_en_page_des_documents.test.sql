-- Tests de la migration 0067_mise_en_page_des_documents.sql.
--
--   · Anne   administratrice
--   · Bruno  référent à Pau-0067, Vénérable Maître
--   · Carla  référente à Pau-0067, Secrétaire
--   · Denis  référent à Dax-0067 — une autre loge
--
-- Ce qui compte ici :
--   · les réglages se lisent par qui produit les documents, et ne s'écrivent
--     que par l'administration ;
--   · le lien du CV anonyme ne donne que le CV anonyme, d'un dossier en cours,
--     à qui a le jeton — et à personne d'autre ;
--   · le vénérable, le secrétaire et le reste ne sortent pas de la loge.

\set ON_ERROR_STOP on
\o /dev/null

\set anne  'cccccccc-6700-0000-0000-000000000001'
\set bruno 'cccccccc-6700-0000-0000-000000000002'
\set carla 'cccccccc-6700-0000-0000-000000000003'
\set denis 'cccccccc-6700-0000-0000-000000000004'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'anne',  'anne0067@example.org',  '{"role":"referent"}'),
  (:'bruno', 'bruno0067@example.org', '{"role":"referent"}'),
  (:'carla', 'carla0067@example.org', '{"role":"referent"}'),
  (:'denis', 'denis0067@example.org', '{"role":"referent"}');
update public.profil set role = 'admin' where id = :'anne';

insert into public.loge (bubble_id, nom, lieu_reunions) values
  ('loge-0067-pau', 'Pau — 0067', 'Salle des fêtes à 11H30'),
  ('loge-0067-dax', 'Dax — 0067', null)
on conflict do nothing;

select id as l_pau from public.loge where bubble_id = 'loge-0067-pau' \gset
select id as l_dax from public.loge where bubble_id = 'loge-0067-dax' \gset

insert into public.referent (bubble_id, profil_id, nom, prenom, email, telephone, college, loge_id) values
  ('ref-0067-bruno', :'bruno', 'BRUNEL', 'Bruno', 'bruno0067@example.org', '0600000002', ' vénérable maître ', :'l_pau'::uuid),
  ('ref-0067-carla', :'carla', 'CARRE',  'Carla', 'carla0067@example.org', '0600000003', 'Secrétaire',        :'l_pau'::uuid),
  ('ref-0067-denis', :'denis', 'DENIS',  'Denis', 'denis0067@example.org', '0600000004', 'Vénérable Maître',  :'l_dax'::uuid)
on conflict do nothing;

select id as r_bruno from public.referent where bubble_id = 'ref-0067-bruno' \gset
select id as r_denis from public.referent where bubble_id = 'ref-0067-denis' \gset

insert into public.reunion (loge_id, tenue_le, ouverte_par) values
  (:'l_pau'::uuid, date '2026-10-28', :'r_bruno'::uuid),
  (:'l_pau'::uuid, date '2026-11-12', :'r_bruno'::uuid),
  (:'l_dax'::uuid, date '2026-10-28', :'r_denis'::uuid);

select id as seance from public.reunion where loge_id = :'l_pau'::uuid and tenue_le = date '2026-10-28' \gset
select id as chez_denis from public.reunion where loge_id = :'l_dax'::uuid \gset

insert into public.candidat (numero, nom, prenom, loge_id, referent_id, emploi_recherche,
                             definition_emploi, type_emploi, cloture, archive) values
  (6701, 'AUBRY',  'Lina', :'l_pau'::uuid, :'r_bruno'::uuid, 'CHEF DE CHANTIER', 'Gros œuvre, région paloise', 'Emploi', null, null),
  (6702, 'BESSON', 'Marc', :'l_pau'::uuid, :'r_bruno'::uuid, 'COMPTABLE',        null,                          'Stage',  null, null),
  (6703, 'CLERC',  'Nour', :'l_pau'::uuid, :'r_bruno'::uuid, 'JURISTE',          null,                          'Emploi', 'Trouvé', null),
  (6704, 'DUPRE',  'Olga', :'l_dax'::uuid, :'r_denis'::uuid, 'VENDEUSE',         null,                          'Emploi', null, null);

-- Un CV anonyme sur le 6701 et le 6703 (clôturé), aucun sur le 6702.
update public.candidat set cv_anonyme_chemin = 'candidats/6701/cv-anonyme.pdf' where numero = 6701;
update public.candidat set cv_anonyme_chemin = 'candidats/6703/cv-anonyme.pdf' where numero = 6703;

select id as c_aubry, cv_anonyme_jeton as j_aubry from public.candidat where numero = 6701 \gset
select id as c_besson, cv_anonyme_jeton as j_besson from public.candidat where numero = 6702 \gset
select cv_anonyme_jeton as j_clerc from public.candidat where numero = 6703 \gset
select id as c_dupre from public.candidat where numero = 6704 \gset

insert into public.entreprise (nom, propose_offre) values
  ('SARL EXEMPLE 0067', true),
  ('SAS SANS OFFRE 0067', false);

-- ---------------------------------------------------------------------------
\echo '— chaque candidat a son propre jeton, des l insertion'
-- ---------------------------------------------------------------------------
select public.verifier(
  (select count(*) from public.candidat where cv_anonyme_jeton is null) = 0,
  'aucun candidat sans jeton');
select public.verifier(
  (select count(distinct cv_anonyme_jeton) from public.candidat) = (select count(*) from public.candidat),
  'et jamais deux fois le meme');

-- ---------------------------------------------------------------------------
\echo '— le lien du CV anonyme s ouvre sans compte, et ne donne que cela'
-- ---------------------------------------------------------------------------
begin;
  set local role anon;
  select public.verifier(
    (select chemin from public.cv_anonyme_public(:'j_aubry'::uuid)) = 'candidats/6701/cv-anonyme.pdf',
    'anon obtient le CV anonyme d un dossier en cours');
  select public.verifier(
    (select numero from public.cv_anonyme_public(:'j_aubry'::uuid)) = 6701,
    'avec le numero du dossier, pour nommer le fichier — et rien d autre');
  select public.verifier(
    (select count(*) from public.cv_anonyme_public(:'j_besson'::uuid)) = 0,
    'rien quand le dossier n a pas de CV anonyme');
  select public.verifier(
    (select count(*) from public.cv_anonyme_public(:'j_clerc'::uuid)) = 0,
    'rien quand le dossier est cloture : le lien s eteint seul');
  select public.verifier(
    (select count(*) from public.cv_anonyme_public(gen_random_uuid())) = 0,
    'rien pour un jeton invente');
commit;

do $$
begin
  set local role anon;
  begin
    perform 1 from public.candidat limit 1;
    raise exception 'ÉCHEC — anon lit la table des candidats';
  exception when insufficient_privilege then
    raise notice '  ok — la table, elle, reste fermee a anon';
  end;
  begin
    perform 1 from public.commission_du_candidat(gen_random_uuid());
    raise exception 'ÉCHEC — anon interroge la commission d un candidat';
  exception when insufficient_privilege then
    raise notice '  ok — et les autres fonctions des documents aussi';
  end;
end
$$;

-- ---------------------------------------------------------------------------
\echo '— les reglages se lisent par un referent, et ne s ecrivent que par l administration'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cccccccc-6700-0000-0000-000000000001"}';
  select public.regler_la_mise_en_page('affiche', '{"titre.taille": 20, "titre.couleur": "#112233"}');
  select public.regler_la_mise_en_page('affiche', '{"date.taille": 13}', array['titre.couleur']);
  select public.deposer_une_image_de_mise_en_page('affiche', 'entete.logo', 'image/png', 'iVBORw0KGgo=');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cccccccc-6700-0000-0000-000000000002"}';
  select public.verifier(
    (select reglages from public.mise_en_page where document = 'affiche')
      = '{"titre.taille": 20, "date.taille": 13}'::jsonb,
    'les reglages se fusionnent, et ce qu on retire part');
  select public.verifier(
    (select count(*) from public.mise_en_page_image where document = 'affiche') = 1,
    'un referent lit les reglages et les images : il produit les documents');
commit;

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"cccccccc-6700-0000-0000-000000000002"}', true);
  begin
    perform public.regler_la_mise_en_page('affiche', '{}'::jsonb, '{}', true);
    raise exception 'ÉCHEC — un referent a modifie la mise en page';
  exception when insufficient_privilege then
    raise notice '  ok — un referent ne modifie pas la mise en page';
  end;
  begin
    perform public.deposer_une_image_de_mise_en_page('affiche', 'entete.logo', 'image/png', 'AAAA');
    raise exception 'ÉCHEC — un referent a depose une image';
  exception when insufficient_privilege then
    raise notice '  ok — ni ne depose une image';
  end;
  begin
    perform public.retirer_une_image_de_mise_en_page('affiche', 'entete.logo');
    raise exception 'ÉCHEC — un referent a retire une image';
  exception when insufficient_privilege then
    raise notice '  ok — ni ne la retire';
  end;
  begin
    update public.mise_en_page set reglages = '{}' where document = 'affiche';
    raise exception 'ÉCHEC — la table s ecrit directement';
  exception when insufficient_privilege then
    raise notice '  ok — et la table ne s ecrit pas en direct';
  end;
end
$$;

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"cccccccc-6700-0000-0000-000000000001"}', true);
  begin
    perform public.regler_la_mise_en_page('facture', '{}'::jsonb);
    raise exception 'ÉCHEC — un document inconnu a ete accepte';
  exception when check_violation then
    raise notice '  ok — trois documents, pas un de plus';
  end;
  begin
    perform public.regler_la_mise_en_page('affiche', '[1, 2]'::jsonb);
    raise exception 'ÉCHEC — des reglages qui ne sont pas un objet';
  exception when invalid_parameter_value then
    raise notice '  ok — les reglages sont un objet';
  end;
  begin
    perform public.deposer_une_image_de_mise_en_page('affiche', 'entete.logo2', 'image/svg+xml', 'PHN2Zz4=');
    raise exception 'ÉCHEC — une image SVG a ete acceptee';
  exception when check_violation then
    raise notice '  ok — PNG et JPEG seulement : ce qu un PDF sait embarquer';
  end;
end
$$;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cccccccc-6700-0000-0000-000000000001"}';
  select public.regler_la_mise_en_page('affiche', '{}'::jsonb, '{}', true);
  select public.verifier(
    (select reglages from public.mise_en_page where document = 'affiche') = '{}'::jsonb
    and (select count(*) from public.mise_en_page_image where document = 'affiche') = 0,
    'revenir a l origine efface les reglages et les images deposees');
commit;

-- ---------------------------------------------------------------------------
\echo '— la commission de la reunion : venerable, secretaire, et la suite'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cccccccc-6700-0000-0000-000000000003"}';

  select public.verifier(
    (select venerable_nom from public.commission_de_la_reunion(:'seance'::uuid)) = 'BRUNEL',
    'le venerable est trouve malgre la casse et les espaces du titre');
  select public.verifier(
    (select secretaire_prenom from public.commission_de_la_reunion(:'seance'::uuid)) = 'Carla',
    'et le secretaire');
  select public.verifier(
    (select nombre_dossiers from public.commission_de_la_reunion(:'seance'::uuid)) = 6703,
    'le plus grand numero de la loge, clotures compris : a traite plus de …');
  select public.verifier(
    (select prochaine_reunion from public.commission_de_la_reunion(:'seance'::uuid)) = date '2026-11-12',
    'la reunion suivante deja inscrite');
  select public.verifier(
    (select lieu_reunions from public.commission_de_la_reunion(:'seance'::uuid)) = 'Salle des fêtes à 11H30',
    'et le lieu des reunions');
  select public.verifier(
    (select count(*) from public.commission_de_la_reunion(:'chez_denis'::uuid)) = 0,
    'rien pour une reunion d une autre loge');
commit;

-- ---------------------------------------------------------------------------
\echo '— la commission du candidat : la porte de la fiche'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cccccccc-6700-0000-0000-000000000002"}';

  select public.verifier(
    (select cv_anonyme_jeton from public.commission_du_candidat(:'c_aubry'::uuid)) = :'j_aubry'::uuid,
    'le jeton du CV anonyme, quand il y en a un');
  select public.verifier(
    (select cv_anonyme_jeton from public.commission_du_candidat(:'c_besson'::uuid)) is null,
    'pas de jeton sans CV anonyme : pas de QR code vers un fichier absent');
  select public.verifier(
    (select loge_nom from public.commission_du_candidat(:'c_aubry'::uuid)) = 'Pau — 0067',
    'le nom de la commission');
  select public.verifier(
    (select count(*) from public.commission_du_candidat(:'c_dupre'::uuid)) = 0,
    'rien pour un candidat d une autre loge');
commit;

-- ---------------------------------------------------------------------------
\echo '— les dossiers en cours portent la definition et le jeton'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cccccccc-6700-0000-0000-000000000002"}';

  select public.verifier(
    (select definition_emploi from public.dossiers_en_cours(:'seance'::uuid) where numero = 6701)
      = 'Gros œuvre, région paloise',
    'la definition de l emploi');
  select public.verifier(
    (select cv_anonyme_jeton from public.dossiers_en_cours(:'seance'::uuid) where numero = 6701) = :'j_aubry'::uuid
    and (select cv_anonyme_jeton from public.dossiers_en_cours(:'seance'::uuid) where numero = 6702) is null,
    'le jeton seulement pour qui a un CV anonyme');
  select public.verifier(
    (select count(*) from public.dossiers_en_cours(:'seance'::uuid) where numero = 6703) = 0,
    'et toujours rien de clos');
commit;

-- ---------------------------------------------------------------------------
\echo '— les offres remontees a la commission'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cccccccc-6700-0000-0000-000000000002"}';
  select public.verifier(
    (select count(*) from public.offres_de_la_commission() where societe = 'SARL EXEMPLE 0067') = 1
    and (select count(*) from public.offres_de_la_commission() where societe = 'SAS SANS OFFRE 0067') = 0,
    'les entreprises qui proposent une offre, et elles seules');
commit;

\o
\echo '0067 — la mise en page des documents : tout est vert.'
