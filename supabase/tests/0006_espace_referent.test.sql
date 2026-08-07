-- Tests de la migration 0006_espace_referent.sql.
--
-- La question à laquelle ce fichier répond : « un référent peut-il voir le
-- dossier de quelqu'un qu'il n'accompagne pas ? » On ne la pose pas à une page
-- web — on la pose à la base, en devenant tour à tour chaque personne.
--
-- C'est le contrôle qui compte : au moment du relevé, l'application Bubble
-- répondait à tout Internet sans jeton, fiches candidats comprises.

\set ON_ERROR_STOP on
\o /dev/null

\set bernard 'aaaaaaaa-0000-0000-0000-000000000001'
\set michel  'aaaaaaaa-0000-0000-0000-000000000002'
\set claire  'aaaaaaaa-0000-0000-0000-000000000003'
-- Alice, inscrite au test 0001, n'a aucune fiche de référent : elle sert de
-- témoin — une personne connectée, et rien de plus.
\set sans_fiche '11111111-1111-1111-1111-111111111111'

-- ---------------------------------------------------------------------------
-- Le décor : deux loges, quatre référents, quatre candidats.
-- Toutes ces personnes sont inventées.
-- ---------------------------------------------------------------------------
insert into public.loge (bubble_id, nom) values
  ('loge-bordeaux', 'Bordeaux'),
  ('loge-toulouse', 'Toulouse');

insert into public.referent (bubble_id, nom, prenom, email, loge_id) values
  ('ref-bernard', 'Delorme', 'Bernard', 'bernard@example.org',
     (select id from public.loge where bubble_id = 'loge-bordeaux')),
  ('ref-michel',  'Aubert',  'Michel',  'michel@example.org',
     (select id from public.loge where bubble_id = 'loge-bordeaux')),
  ('ref-claire',  'Vasseur', 'Claire',  'claire@example.org',
     (select id from public.loge where bubble_id = 'loge-toulouse')),
  -- Odette siège dans la même loge que Bernard mais n'accompagne aucun de ses
  -- candidats : elle doit lui rester invisible.
  ('ref-odette',  'Sans',    'Odette',  'odette@example.org',
     (select id from public.loge where bubble_id = 'loge-bordeaux'));

insert into public.candidat
  (bubble_id, numero, nom, prenom, type_emploi, loge_id, referent_id, parrain_id) values
  ('cand-alice',  108, 'Martin',  'Alice',  'Alternance',
     (select id from public.loge where bubble_id = 'loge-bordeaux'),
     (select id from public.referent where bubble_id = 'ref-bernard'),
     (select id from public.referent where bubble_id = 'ref-michel')),
  ('cand-karim',  106, 'Benali',  'Karim',  'Emploi',
     (select id from public.loge where bubble_id = 'loge-bordeaux'),
     (select id from public.referent where bubble_id = 'ref-bernard'),
     null),
  ('cand-sophie', 104, 'Lemaire', 'Sophie', 'Stage',
     (select id from public.loge where bubble_id = 'loge-toulouse'),
     (select id from public.referent where bubble_id = 'ref-claire'),
     null),
  -- Théo est suivi par Claire, mais parrainé par Michel : il éprouve que le
  -- parrainage ouvre le dossier autant que le référencement.
  ('cand-theo',   103, 'Roussel', 'Théo',   'Emploi',
     (select id from public.loge where bubble_id = 'loge-toulouse'),
     (select id from public.referent where bubble_id = 'ref-claire'),
     (select id from public.referent where bubble_id = 'ref-michel'));

-- ---------------------------------------------------------------------------
\echo '— le compte rejoint la fiche reprise de Bubble'
-- ---------------------------------------------------------------------------
-- Bernard s'inscrit en demandant « chercheur » : c'est la base qui sait qu'il
-- accompagne des candidats, pas le formulaire.
insert into auth.users (id, email, raw_user_meta_data) values
  (:'bernard', 'BERNARD@Example.ORG', '{"role":"chercheur","nom":"Delorme","prenom":"Bernard"}'),
  (:'michel',  'michel@example.org',  '{"role":"referent","nom":"Aubert","prenom":"Michel"}'),
  (:'claire',  'claire@example.org',  '{"role":"referent","nom":"Vasseur","prenom":"Claire"}');

select public.verifier(
  (select profil_id from public.referent where bubble_id = 'ref-bernard') = :'bernard',
  'l''inscription rattache le compte à la fiche de référent, par l''adresse email');

select public.verifier(
  (select profil_id from public.referent where bubble_id = 'ref-odette') is null,
  'une fiche sans compte reste libre');

select public.verifier(
  (select role from public.profil where id = :'bernard') = 'referent',
  'le rôle suit le rattachement — la base sait qu''il accompagne');

select public.verifier(
  (select public.rattacher_referent_au_compte(:'claire', 'bernard@example.org')) =
  (select id from public.referent where bubble_id = 'ref-claire'),
  'un compte déjà rattaché ne se déplace pas vers une autre fiche');

-- ---------------------------------------------------------------------------
\echo '— ce que voit Bernard, référent de deux candidats'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}';

  select public.verifier((select count(*) from public.candidat) = 2,
    'Bernard voit deux candidats — les siens');
  select public.verifier(
    (select array_agg(prenom order by prenom) from public.candidat) = array['Alice', 'Karim'],
    'et ce sont bien Alice et Karim');
  select public.verifier(
    (select count(*) from public.candidat where bubble_id in ('cand-sophie', 'cand-theo')) = 0,
    'les candidats de Claire n''existent pas pour lui');

  select public.verifier(
    (select count(*) from public.candidat where numero = 104) = 0,
    'chercher par numéro ne les fait pas apparaître non plus');

  select public.verifier((select count(*) from public.referent) = 2,
    'il ne voit que deux fiches de référent : la sienne et celle du parrain d''Alice');
  select public.verifier(
    (select count(*) from public.referent where bubble_id = 'ref-odette') = 0,
    'Odette, de sa loge mais sans candidat commun, lui reste invisible');

  select public.verifier((select count(*) from public.loge) = 1,
    'et une seule loge');
  select public.verifier((select nom from public.loge) = 'Bordeaux',
    'la sienne');
commit;

-- ---------------------------------------------------------------------------
\echo '— le parrain voit ses filleuls, et rien de plus'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000002"}';

  select public.verifier(
    (select array_agg(prenom order by prenom) from public.candidat) = array['Alice', 'Théo'],
    'Michel voit Alice et Théo — ceux qu''il parraine, dans deux loges différentes');
  select public.verifier(
    (select count(*) from public.candidat where bubble_id = 'cand-karim') = 0,
    'Karim, du même référent qu''Alice mais sans parrain, lui échappe');
commit;

-- ---------------------------------------------------------------------------
\echo '— une personne connectée sans fiche de référent ne voit rien'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

  select public.verifier((select count(*) from public.candidat) = 0,
    'aucun candidat');
  select public.verifier((select count(*) from public.referent) = 0,
    'aucun référent');
  select public.verifier((select count(*) from public.loge) = 0,
    'aucune loge');
  select public.verifier((select public.referent_courant()) is null,
    'elle n''a tout simplement pas de fiche');
commit;

-- ---------------------------------------------------------------------------
\echo '— modifier : chez soi seulement'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}';
  update public.candidat set appreciation = 'Très motivée' where bubble_id = 'cand-alice';
commit;
select public.verifier(
  (select appreciation from public.candidat where bubble_id = 'cand-alice') = 'Très motivée',
  'Bernard renseigne bien la fiche d''Alice');

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}';
  update public.candidat set appreciation = 'Détournée' where bubble_id = 'cand-sophie';
commit;
select public.verifier(
  (select appreciation from public.candidat where bubble_id = 'cand-sophie') is null,
  'mais la fiche de Sophie ne bouge pas d''un pouce');

-- ---------------------------------------------------------------------------
\echo '— le rattachement ne se change pas depuis l application'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}';
  -- Bernard tente de s'attribuer Sophie : la ligne ne lui est même pas visible.
  update public.candidat
     set referent_id = (select id from public.referent where bubble_id = 'ref-bernard')
   where bubble_id = 'cand-sophie';
commit;
select public.verifier(
  (select referent_id from public.candidat where bubble_id = 'cand-sophie')
    = (select id from public.referent where bubble_id = 'ref-claire'),
  'Sophie reste rattachée à Claire — on ne s''attribue pas un dossier');

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}';
  -- Et il ne peut pas non plus donner Alice à quelqu'un d'autre.
  update public.candidat
     set referent_id = (select id from public.referent where bubble_id = 'ref-claire'),
         numero = 999
   where bubble_id = 'cand-alice';
commit;
select public.verifier(
  (select referent_id from public.candidat where bubble_id = 'cand-alice')
    = (select id from public.referent where bubble_id = 'ref-bernard'),
  'Alice reste chez Bernard : le déclencheur remet le rattachement d''origine');
select public.verifier(
  (select numero from public.candidat where bubble_id = 'cand-alice') = 108,
  'et son numéro de candidat ne se réécrit pas non plus');

-- ---------------------------------------------------------------------------
\echo '— ni créer, ni supprimer : aucun écran ne le fait encore'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', true);
  begin
    insert into public.candidat (bubble_id, nom, prenom) values ('cand-pirate', 'Pirate', 'Jean');
    raise exception 'ÉCHEC — un référent a pu créer un candidat';
  exception when insufficient_privilege then
    raise notice '  ok — créer un candidat est refusé : aucune policy ne l''autorise';
  end;
end
$$;

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', true);
  begin
    delete from public.candidat where bubble_id = 'cand-alice';
    raise exception 'ÉCHEC — un référent a pu lancer une suppression';
  exception when insufficient_privilege then
    raise notice '  ok — supprimer un candidat est refusé, dès le droit sur la table';
  end;
end
$$;
select public.verifier(
  (select count(*) from public.candidat where bubble_id = 'cand-alice') = 1,
  'et la fiche est toujours là');

-- ---------------------------------------------------------------------------
\echo '— l administration, elle, garde la main'
-- ---------------------------------------------------------------------------
begin;
  set local role service_role;
  update public.candidat
     set referent_id = (select id from public.referent where bubble_id = 'ref-claire')
   where bubble_id = 'cand-karim';
commit;
select public.verifier(
  (select referent_id from public.candidat where bubble_id = 'cand-karim')
    = (select id from public.referent where bubble_id = 'ref-claire'),
  'la clé service_role déplace bien un candidat — c''est par là que passera l''administration');

-- ---------------------------------------------------------------------------
\echo '— et le déplacement se voit des deux côtés'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}';
  select public.verifier((select count(*) from public.candidat) = 1,
    'Bernard ne voit plus que Alice : Karim lui a été retiré');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000003"}';
  select public.verifier(
    (select array_agg(prenom order by prenom) from public.candidat)
      = array['Karim', 'Sophie', 'Théo'],
    'et Claire, elle, l''a reçu');
commit;

\echo ''
\echo 'Tous les contrôles de 0006_espace_referent.sql sont passés.'
