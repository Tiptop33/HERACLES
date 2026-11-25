-- Tests de la migration 0105_page_candidat.sql.
--
-- Les personnes :
--
--   · Rémi   référent d'Inès, loge Lyon-0105
--   · Paula  marraine d'Inès, même loge
--   · Odile  autre référente de Lyon-0105 — lit la fiche, pas les messages
--   · Xavier référent de Brest-0105 — ne voit rien d'Inès
--   · Inès   candidate, compte « chercheur », reliée par l'invitation
--   · Ève    compte « chercheur » qui n'a aucune fiche
--   · Zoé    administratrice
--
-- Bob est un dossier sans compte, avec un CV déposé par sa candidature.

\set ON_ERROR_STOP on
\o /dev/null

\set remi   'aaaaaaaa-0105-0000-0000-000000000001'
\set paula  'aaaaaaaa-0105-0000-0000-000000000002'
\set odile  'aaaaaaaa-0105-0000-0000-000000000003'
\set xavier 'aaaaaaaa-0105-0000-0000-000000000004'
\set ines   'aaaaaaaa-0105-0000-0000-000000000005'
\set eve    'aaaaaaaa-0105-0000-0000-000000000006'
\set zoe    'aaaaaaaa-0105-0000-0000-000000000007'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'remi',   'remi0105@example.org',   '{"role":"referent","nom":"Rémi","prenom":"R"}'),
  (:'paula',  'paula0105@example.org',  '{"role":"referent","nom":"Paula","prenom":"P"}'),
  (:'odile',  'odile0105@example.org',  '{"role":"referent","nom":"Odile","prenom":"O"}'),
  (:'xavier', 'xavier0105@example.org', '{"role":"referent","nom":"Xavier","prenom":"X"}'),
  (:'ines',   'ines0105@example.org',   '{"role":"chercheur","nom":"Moreau","prenom":"Inès"}'),
  (:'eve',    'eve0105@example.org',    '{"role":"chercheur"}'),
  (:'zoe',    'zoe0105@example.org',    '{"role":"admin"}')
on conflict do nothing;
update public.profil set role = 'admin' where id = :'zoe';

insert into public.loge (bubble_id, nom) values
  ('loge-0105-lyon',  'Lyon — 0105'),
  ('loge-0105-brest', 'Brest — 0105')
on conflict do nothing;
select id as lyon  from public.loge where bubble_id = 'loge-0105-lyon'  \gset
select id as brest from public.loge where bubble_id = 'loge-0105-brest' \gset

insert into public.referent (bubble_id, profil_id, nom, prenom, email, loge_id) values
  ('ref-0105-remi',   :'remi',   'Rémi',   'R', 'remi0105@example.org',   :'lyon'),
  ('ref-0105-paula',  :'paula',  'Paula',  'P', 'paula0105@example.org',  :'lyon'),
  ('ref-0105-odile',  :'odile',  'Odile',  'O', 'odile0105@example.org',  :'lyon'),
  ('ref-0105-xavier', :'xavier', 'Xavier', 'X', 'xavier0105@example.org', :'brest')
on conflict do nothing;
select id as r_remi  from public.referent where bubble_id = 'ref-0105-remi'  \gset
select id as r_paula from public.referent where bubble_id = 'ref-0105-paula' \gset

\set c_ines 'cccccccc-0105-0000-0000-000000000001'
\set c_bob  'cccccccc-0105-0000-0000-000000000002'

insert into public.candidat (id, loge_id, numero, nom, prenom, email, code_postal,
                             referent_id, parrain_id, connait_appartenance, urgence, appreciation)
values (:'c_ines', :'lyon', 951, 'Moreau', 'Inès', 'ines0105@example.org', '33700',
        :'r_remi', :'r_paula', 'Non', 3, 'Très motivée')
on conflict do nothing;

insert into public.candidat (id, loge_id, numero, nom, prenom, email, cv_chemin)
values (:'c_bob', :'lyon', 952, 'Bob', 'B', 'bob0105@example.org',
        'candidat/cv/cccccccc-0105-0000-0000-000000000002.pdf')
on conflict do nothing;

-- Les secteurs d'Inès : la construction (section F).
insert into public.candidat_secteur (candidat_id, rang, code, propose_par)
values (:'c_ines', 1, 'F', 'candidat') on conflict do nothing;

-- Trois offres : maçonnerie à Bordeaux, bâtiment dans les Landes, restaurant à Bordeaux.
insert into public.offre_emploi (source_id, intitule, entreprise_nom, lieu_libelle, lieu_code_postal,
                                 code_naf, date_creation, description) values
  ('ft-0105-1', 'Plaquiste', 'Atlantique 0105', '33 - BORDEAUX', '33000', '43.31Z', now() - interval '1 day', 'Pose de cloisons'),
  ('ft-0105-2', 'Maçon', 'Adour 0105', '40 - DAX', '40100', '41.20A', now() - interval '10 days', 'Maisons individuelles'),
  ('ft-0105-3', 'Serveur', 'Brasserie 0105', '33 - BORDEAUX', '33000', '56.10A', now() - interval '1 day', 'Service en salle');

-- ---------------------------------------------------------------------------
\echo '— la reprise : un chemin posé sur la fiche devient un document'
-- ---------------------------------------------------------------------------
select public.verifier(
  (select count(*) = 1 and bool_and(principal) and bool_and(depose_par = 'reprise')
     from public.candidat_document where candidat_id = :'c_bob' and genre = 'cv'),
  'le CV de Bob est devenu son document principal');

-- ---------------------------------------------------------------------------
\echo '— l''invitation'
-- ---------------------------------------------------------------------------
\set empreinte1 '1111111111111111111111111111111111111111111111111111111111111111'
\set empreinte2 '2222222222222222222222222222222222222222222222222222222222222222'

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0105-0000-0000-000000000001"}';
  select public.verifier(
    (select email = 'ines0105@example.org' and not a_deja_un_compte
       from public.inviter_le_candidat_a_sa_page(:'c_ines', :'empreinte1')),
    'le référent invite Inès à sa page');
  select public.verifier(
    (select a_un_compte = false and invitee_le is not null and peut_inviter
       from public.etat_de_la_page_candidat(:'c_ines')),
    'le référent voit l''invitation partie');
commit;

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0105-0000-0000-000000000004"}', true);
  perform * from public.inviter_le_candidat_a_sa_page('cccccccc-0105-0000-0000-000000000001',
    '3333333333333333333333333333333333333333333333333333333333333333');
  raise exception 'ÉCHEC — un référent d''une autre loge a pu inviter';
exception when insufficient_privilege then
  raise notice '  ok — un référent d''une autre loge ne peut pas inviter';
end
$$;
reset role;

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0105-0000-0000-000000000003"}', true);
  perform * from public.inviter_le_candidat_a_sa_page('cccccccc-0105-0000-0000-000000000001',
    '3333333333333333333333333333333333333333333333333333333333333333');
  raise exception 'ÉCHEC — une référente de la loge qui n''accompagne pas a pu inviter';
exception when insufficient_privilege then
  raise notice '  ok — lire la fiche ne suffit pas pour inviter';
end
$$;
reset role;

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0105-0000-0000-000000000006"}', true);
  perform * from public.invitation_a_la_page('1111111111111111111111111111111111111111111111111111111111111111');
  raise exception 'ÉCHEC — une session a pu lire une invitation';
exception when insufficient_privilege then
  raise notice '  ok — l''invitation ne se lit qu''avec la clé de service';
end
$$;
reset role;

begin;
  set local role service_role;
  select public.verifier(
    (select valable and candidat_id = :'c_ines'::uuid from public.invitation_a_la_page(:'empreinte1')),
    'la clé de service lit l''invitation');
  select public.verifier(
    (select role = 'chercheur' and candidat_id is null from public.compte_pour_la_page('INES0105@example.org')),
    'le compte d''Inès se retrouve par son adresse, sans fiche encore');
commit;

-- Une adresse de référent ne devient pas un compte candidat.
do $$
begin
  set local role service_role;
  perform public.accepter_l_invitation_a_la_page(
    '1111111111111111111111111111111111111111111111111111111111111111',
    'aaaaaaaa-0105-0000-0000-000000000001');
  raise exception 'ÉCHEC — un compte de référent a été relié à une fiche de candidat';
exception when insufficient_privilege then
  raise notice '  ok — un compte de référent n''est pas relié';
end
$$;
reset role;

begin;
  set local role service_role;
  select public.verifier(
    public.accepter_l_invitation_a_la_page(:'empreinte1', :'ines') = :'c_ines'::uuid,
    'l''invitation relie le compte d''Inès à sa fiche');
commit;

select public.verifier(
  (select profil_id = :'ines'::uuid from public.candidat where id = :'c_ines'),
  'la fiche porte le compte');

do $$
begin
  set local role service_role;
  perform public.accepter_l_invitation_a_la_page(
    '1111111111111111111111111111111111111111111111111111111111111111',
    'aaaaaaaa-0105-0000-0000-000000000005');
  raise exception 'ÉCHEC — le lien a servi deux fois';
exception when invalid_authorization_specification then
  raise notice '  ok — le lien ne sert qu''une fois';
end
$$;
reset role;

-- Ève ne peut pas être reliée à la fiche d'Inès, ni Inès à une seconde fiche.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0105-0000-0000-000000000001"}';
  select * from public.inviter_le_candidat_a_sa_page(:'c_ines', :'empreinte2');
commit;
insert into public.candidat (id, loge_id, numero, nom, prenom, email, referent_id)
values ('cccccccc-0105-0000-0000-000000000003', :'lyon', 953, 'Autre', 'A', 'ines0105@example.org', :'r_remi')
on conflict do nothing;
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0105-0000-0000-000000000001"}';
  select * from public.inviter_le_candidat_a_sa_page('cccccccc-0105-0000-0000-000000000003',
    '4444444444444444444444444444444444444444444444444444444444444444');
commit;
do $$
begin
  set local role service_role;
  perform public.accepter_l_invitation_a_la_page(
    '4444444444444444444444444444444444444444444444444444444444444444',
    'aaaaaaaa-0105-0000-0000-000000000005');
  raise exception 'ÉCHEC — un compte a été relié à deux fiches';
exception when unique_violation then
  raise notice '  ok — un compte n''a qu''une fiche';
end
$$;
reset role;

-- ---------------------------------------------------------------------------
\echo '— ce que le candidat voit de sa fiche'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0105-0000-0000-000000000005"}';
  select public.verifier(public.mon_dossier() = :'c_ines'::uuid, 'Inès retrouve son dossier');
  select public.verifier(
    (select f ->> 'prenom' = 'Inès' and f ->> 'referent' = 'R Rémi'
            and not (f ? 'connait_appartenance') and not (f ? 'urgence')
            and not (f ? 'appreciation') and not (f ? 'loge_id')
            and jsonb_array_length(f -> 'secteurs') = 1
       from (select public.ma_fiche_de_candidat() as f) x),
    'sa fiche ne dit rien de l''accompagnement');
  select public.verifier(
    (select count(*) = 0 from public.candidat),
    'la table candidat lui reste fermée');
  select public.modifier_ma_fiche_de_candidat('telephone', ' 06 11 22 33 44 ');
  select public.modifier_ma_fiche_de_candidat('situation_familiale', 'Célibataire');
  select public.modifier_ma_fiche_de_candidat('debut_stage', '2027-01-04');
  select public.modifier_ma_fiche_de_candidat('age', '');
  select public.verifier(
    (select f ->> 'telephone' = '06 11 22 33 44' and f ->> 'debut_stage' = '2027-01-04'
            and f ->> 'situation_familiale' = 'Célibataire' and f -> 'age' = 'null'::jsonb
       from (select public.ma_fiche_de_candidat() as f) x),
    'chaque champ s''enregistre seul');
commit;

select public.verifier(
  (select referent_id = :'r_remi'::uuid and appreciation = 'Très motivée' and urgence = 3
     from public.candidat where id = :'c_ines'),
  'l''accompagnement n''a pas bougé');

do $$
declare
  essais text[][] := array[
    ['prenom', ''], ['age', '120'], ['situation_familiale', 'le fils'],
    ['permis_vl', 'Peut-être'], ['fin_stage', '2026-12-01'], ['debut_stage', '2027-02-30']];
  i int;
  champ text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0105-0000-0000-000000000005"}', true);
  for i in 1 .. array_length(essais, 1) loop
    begin
      perform public.modifier_ma_fiche_de_candidat(essais[i][1], essais[i][2]);
      raise exception 'ÉCHEC — % = « % » a été accepté', essais[i][1], essais[i][2];
    exception when check_violation then
      raise notice '  ok — % = « % » est refusé', essais[i][1], essais[i][2];
    end;
  end loop;
  foreach champ in array array['appreciation', 'referent_id', 'profil_id', 'urgence', 'connait_appartenance'] loop
    begin
      perform public.modifier_ma_fiche_de_candidat(champ, 'x');
      raise exception 'ÉCHEC — le champ % a été écrit', champ;
    exception when invalid_parameter_value then
      raise notice '  ok — le champ % n''est pas à lui', champ;
    end;
  end loop;
end
$$;
reset role;

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0105-0000-0000-000000000006"}', true);
  perform public.modifier_ma_fiche_de_candidat('prenom', 'Pirate');
  raise exception 'ÉCHEC — un compte sans fiche a écrit une fiche';
exception when insufficient_privilege then
  raise notice '  ok — Ève n''a pas de fiche à écrire';
end
$$;
reset role;

-- ---------------------------------------------------------------------------
\echo '— les secteurs'
-- ---------------------------------------------------------------------------
update public.candidat_secteur set confirme_par = :'r_remi', confirme_le = now()
 where candidat_id = :'c_ines' and code = 'F';
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0105-0000-0000-000000000005"}';
  select public.verifier(
    (select jsonb_array_length(l) = 2
            and l -> 0 ->> 'code' = 'F' and l -> 0 ->> 'confirme_le' is not null
            and l -> 1 ->> 'code' = '71' and l -> 1 ->> 'confirme_le' is null
            and l -> 1 ->> 'propose_par' = 'candidat'
       from (select public.proposer_mes_secteurs(array['F', '71']) as l) x),
    'un secteur ajouté attend le référent, le confirmé le reste');
  select public.verifier(
    (select count(*) > 0 from public.rechercher_un_secteur_pour_ma_fiche('construction')),
    'Inès cherche un secteur par un mot');
  select public.proposer_mes_secteurs(array['F']);
commit;

-- ---------------------------------------------------------------------------
\echo '— les offres'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0105-0000-0000-000000000005"}';
  select public.je_regarde_ma_page();
  select public.verifier(
    (select (o ->> 'total')::int = 1 and o -> 'choisis' = '["33"]'::jsonb
            and o -> 'offres' -> 0 ->> 'intitule' = 'Plaquiste'
            and (o -> 'offres' -> 0 ->> 'nouvelle')::boolean
       from (select public.offres_pour_moi() as o) x),
    'par défaut, le département de son adresse et ses secteurs : le plaquiste, nouveau');
  select public.retenir_mes_departements(array['40', '33']);
  select public.verifier(
    (select (o ->> 'total')::int = 2 and o -> 'choisis' = '["33", "40"]'::jsonb
       from (select public.offres_pour_moi() as o) x),
    'les départements cochés sont retenus');
  select public.retenir_mes_departements('{}');
  select public.verifier(
    (select (o ->> 'total')::int = 2 and jsonb_array_length(o -> 'departements') = 2
       from (select public.offres_pour_moi() as o) x),
    'aucun coché : tous les départements, jamais le restaurant');
  select public.verifier(
    (select (o ->> 'total')::int = 1
       from (select public.offres_pour_moi('maisons') as o) x),
    'la recherche par mot s''ajoute aux secteurs');
commit;

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0105-0000-0000-000000000005"}', true);
  perform public.retenir_mes_departements(array['33; drop table']);
  raise exception 'ÉCHEC — un département illisible est passé';
exception when check_violation then
  raise notice '  ok — un département illisible est refusé';
end
$$;
reset role;

-- ---------------------------------------------------------------------------
\echo '— les documents'
-- ---------------------------------------------------------------------------
\set d1 'candidat/documents/cccccccc-0105-0000-0000-000000000001/dddddddd-0000-0000-0000-000000000001.pdf'
\set d2 'candidat/documents/cccccccc-0105-0000-0000-000000000001/dddddddd-0000-0000-0000-000000000002.docx'

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0105-0000-0000-000000000005"}', true);
  perform public.deposer_mon_document('cv', 'CV volé',
    'candidat/documents/cccccccc-0105-0000-0000-000000000002/dddddddd-0000-0000-0000-000000000009.pdf', 'pdf', 10);
  raise exception 'ÉCHEC — Inès a déposé dans le dossier de Bob';
exception when check_violation then
  raise notice '  ok — un chemin hors de son dossier est refusé';
end
$$;
reset role;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0105-0000-0000-000000000005"}';
  select public.deposer_mon_document('cv', 'CV conductrice', :'d1', 'pdf', 421000) as doc1 \gset
  select public.deposer_mon_document('cv', 'CV métreuse', :'d2', 'docx', 380000) as doc2 \gset
  select public.verifier(
    (select principal from public.candidat_document where id = :'doc1'),
    'le premier CV est le principal');
  select public.verifier(
    (select not principal from public.candidat_document where id = :'doc2'),
    'le second ne l''est pas');
commit;

select public.verifier(
  (select cv_chemin = :'d1' from public.candidat where id = :'c_ines'),
  'le principal est recopié sur la fiche');

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0105-0000-0000-000000000005"}';
  select public.choisir_mon_document_principal(:'doc2');
  select public.renommer_mon_document(:'doc2', '  CV métreuse 2026  ');
commit;
select public.verifier(
  (select cv_chemin = :'d2' from public.candidat where id = :'c_ines'),
  'changer de principal change la fiche');
select public.verifier(
  (select nom = 'CV métreuse 2026' from public.candidat_document where id = :'doc2'),
  'un document se renomme');

do $$
declare
  i int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0105-0000-0000-000000000005"}', true);
  for i in 3 .. 5 loop
    perform public.deposer_mon_document('cv', 'CV ' || i,
      'candidat/documents/cccccccc-0105-0000-0000-000000000001/dddddddd-0000-0000-0000-00000000000' || i || '.pdf', 'pdf', 1);
  end loop;
  begin
    perform public.deposer_mon_document('cv', 'CV 6',
      'candidat/documents/cccccccc-0105-0000-0000-000000000001/dddddddd-0000-0000-0000-000000000006.pdf', 'pdf', 1);
    raise exception 'ÉCHEC — un sixième CV est passé';
  exception when program_limit_exceeded then
    raise notice '  ok — cinq CV au plus';
  end;
end
$$;
reset role;

-- Qui voit les documents d'Inès.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0105-0000-0000-000000000003"}';
  select public.verifier((select count(*) = 5 from public.candidat_document where candidat_id = :'c_ines'),
    'Odile, de la loge, voit ses cinq CV');
commit;
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0105-0000-0000-000000000004"}';
  select public.verifier((select count(*) = 0 from public.candidat_document where candidat_id = :'c_ines'),
    'Xavier, d''une autre loge, n''en voit aucun');
commit;
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0105-0000-0000-000000000006"}';
  select public.verifier((select count(*) = 0 from public.candidat_document),
    'Ève ne voit aucun document');
commit;

-- Supprimer le principal : le plus récent prend sa place.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0105-0000-0000-000000000005"}';
  select public.verifier(public.supprimer_mon_document(:'doc2') = :'d2', 'la suppression rend le chemin du fichier');
commit;
select public.verifier(
  (select count(*) = 1 from public.candidat_document
    where candidat_id = :'c_ines' and genre = 'cv' and principal
      and chemin like '%000000000005.pdf'),
  'le plus récent devient le principal');
select public.verifier(
  (select cv_chemin like '%000000000005.pdf' from public.candidat where id = :'c_ines'),
  'et la fiche le suit');

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0105-0000-0000-000000000005"}', true);
  delete from public.candidat_document;
  raise exception 'ÉCHEC — un effacement direct est passé';
exception when insufficient_privilege then
  raise notice '  ok — rien ne s''efface sans passer par la fonction';
end
$$;
reset role;

-- ---------------------------------------------------------------------------
\echo '— les messages'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0105-0000-0000-000000000005"}';
  select public.ecrire_mon_message('  Entretien jeudi chez Atlantique.  ') as m1 \gset
  select public.corriger_mon_message(:'m1', 'Entretien jeudi 10 h chez Atlantique.');
  select public.verifier(
    (select texte = 'Entretien jeudi 10 h chez Atlantique.' and corrige_le is not null
       from public.candidat_message where id = :'m1'),
    'Inès corrige son message dans les 24 heures');
commit;

-- Un message d'avant-hier.
insert into public.candidat_message (id, candidat_id, texte, ecrit_le, ecrit_par)
values ('eeeeeeee-0105-0000-0000-000000000001', :'c_ines', 'CV envoyé à trois entreprises',
        now() - interval '25 hours', :'ines')
on conflict do nothing;

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0105-0000-0000-000000000005"}', true);
  perform public.corriger_mon_message('eeeeeeee-0105-0000-0000-000000000001', 'Autre chose');
  raise exception 'ÉCHEC — un message de plus de 24 heures a été corrigé';
exception when object_not_in_prerequisite_state then
  raise notice '  ok — après 24 heures, le message est gardé tel quel';
end
$$;
reset role;

do $$
begin
  set local role service_role;
  update public.candidat_message set texte = 'Réécrit' where id = 'eeeeeeee-0105-0000-0000-000000000001';
  raise exception 'ÉCHEC — la clé de service a réécrit un vieux message';
exception when object_not_in_prerequisite_state then
  raise notice '  ok — même la clé de service ne le réécrit pas';
end
$$;
reset role;

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0105-0000-0000-000000000005"}', true);
  delete from public.candidat_message;
  raise exception 'ÉCHEC — Inès a effacé ses messages';
exception when insufficient_privilege then
  raise notice '  ok — un message ne s''efface pas';
end
$$;
reset role;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0105-0000-0000-000000000001"}';
  select public.verifier((select count(*) = 2 from public.candidat_message where candidat_id = :'c_ines'),
    'son référent lit ses messages');
commit;
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0105-0000-0000-000000000002"}';
  select public.verifier((select count(*) = 2 from public.candidat_message where candidat_id = :'c_ines'),
    'sa marraine aussi');
commit;
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0105-0000-0000-000000000003"}';
  select public.verifier((select count(*) = 0 from public.candidat_message),
    'Odile, de la même loge, ne les lit pas');
commit;
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0105-0000-0000-000000000007"}';
  select public.verifier((select count(*) = 0 from public.candidat_message),
    'l''administration ne les lit pas');
commit;

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0105-0000-0000-000000000005"}', true);
  perform * from public.qui_prevenir_du_message('eeeeeeee-0105-0000-0000-000000000001');
  raise exception 'ÉCHEC — le candidat a lu l''adresse de son référent';
exception when insufficient_privilege then
  raise notice '  ok — l''adresse du référent ne passe que par la clé de service';
end
$$;
reset role;

begin;
  set local role service_role;
  select public.verifier(
    (select email = 'remi0105@example.org' and numero = 951
       from public.qui_prevenir_du_message('eeeeeeee-0105-0000-0000-000000000001')),
    'la clé de service sait qui prévenir');
commit;

-- ---------------------------------------------------------------------------
\echo '— la photo'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0105-0000-0000-000000000005"}', true);
  perform public.poser_la_photo_de_ma_fiche('candidat/photo/cccccccc-0105-0000-0000-000000000002.jpg');
  raise exception 'ÉCHEC — Inès a posé la photo de Bob';
exception when check_violation then
  raise notice '  ok — la photo ne se pose que dans son dossier';
end
$$;
reset role;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0105-0000-0000-000000000005"}';
  select public.verifier(
    public.poser_la_photo_de_ma_fiche('candidat/photo/cccccccc-0105-0000-0000-000000000001.jpg') is null,
    'une première photo ne remplace rien');
  select public.verifier(
    public.poser_la_photo_de_ma_fiche('candidat/photo/cccccccc-0105-0000-0000-000000000001.png')
      = 'candidat/photo/cccccccc-0105-0000-0000-000000000001.jpg',
    'changer de format rend l''ancien fichier à retirer');
  select public.verifier(
    (select (public.ma_fiche_de_candidat() ->> 'a_une_photo')::boolean),
    'sa fiche dit qu''il y a une photo');
  select public.verifier(
    public.retirer_la_photo_de_ma_fiche() = 'candidat/photo/cccccccc-0105-0000-0000-000000000001.png',
    'la retirer rend le chemin');
commit;

-- ---------------------------------------------------------------------------
\echo '— supprimer un dossier emporte ses documents'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0105-0000-0000-000000000007"}';
  select public.verifier(
    (select issue = 'supprime'
            and fichiers @> array['candidat/cv/cccccccc-0105-0000-0000-000000000002.pdf']
            and cardinality(fichiers) = 1
       from public.supprimer_un_candidat(:'c_bob')),
    'Bob part, son CV quitte le seau, une seule fois');
commit;
select public.verifier(
  (select count(*) = 0 from public.candidat_document where candidat_id = :'c_bob'),
  'ses documents sont partis avec lui');

-- ---------------------------------------------------------------------------
\echo '— personne d''autre n''appelle les fonctions de la page'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role anon;
  perform public.ma_fiche_de_candidat();
  raise exception 'ÉCHEC — un visiteur anonyme a lu une fiche';
exception when insufficient_privilege then
  raise notice '  ok — un visiteur anonyme est refusé';
end
$$;
reset role;

\o
\echo '0105 : tout est passé.'
