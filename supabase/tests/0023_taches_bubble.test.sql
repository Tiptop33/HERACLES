-- Tests de la migration 0023_taches_bubble.sql.
--
-- Le dépliage doit tenir trois promesses, et c'est ce qu'on éprouve ici :
--   · il retrouve le bon candidat, le bon auteur, le bon jour ;
--   · il se rejoue sans doubler, et rattrape ce qui manquait ;
--   · il n'ouvre aucune porte — ni à un référent, ni à un visiteur.
--
--   · Paul   référent à Lyon-0023, il suit Rosa
--   · Rosa   candidate, elle porte deux tâches venues de Bubble
--   · Sami   candidat d'une autre loge, sa tâche arrive après lui

\set ON_ERROR_STOP on
\o /dev/null

\set paul 'aaaaaaaa-3333-0000-0000-000000000031'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'paul', 'paul0023@example.org', '{"role":"referent","nom":"Paul","prenom":"P"}');

insert into public.loge (bubble_id, nom) values
  ('loge-0023-lyon', 'Lyon — 0023')
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, email, loge_id) values
  ('ref-0023-paul', :'paul', 'Paul', 'P', 'paul0023@example.org',
   (select id from public.loge where bubble_id = 'loge-0023-lyon'))
on conflict do nothing;

insert into public.candidat (bubble_id, numero, nom, prenom, ville, loge_id, referent_id) values
  ('cand-0023-rosa', 601, 'Rosa', 'R', 'Lyon',
   (select id from public.loge where bubble_id = 'loge-0023-lyon'),
   (select id from public.referent where bubble_id = 'ref-0023-paul'))
on conflict do nothing;

select id as rosa from public.candidat where bubble_id = 'cand-0023-rosa' \gset

-- Quatre tâches, dans la forme exacte que rend l'API de Bubble.
--
--   · deux pour Rosa, dont une à minuit — l'heure qui bascule de jour si l'on
--     oublie le fuseau ;
--   · une sans intitulé et sans état, pour éprouver les replis ;
--   · une pour Sami, qui n'est pas encore en base.
insert into public.bubble_brut (type_bubble, bubble_id, donnees) values
  ('tache', '1700000000000x001', jsonb_build_object(
     '_id', '1700000000000x001',
     'Titre', 'Relance de l''entreprise, sans réponse.',
     'Date', '2026-03-14T23:00:00.000Z',
     'ETAT', 'En cours',
     'Num CANDIDAT tach', jsonb_build_array('cand-0023-rosa'),
     'Created By', 'ref-0023-paul',
     'Created Date', '2026-03-15T08:12:00.000Z')),
  ('tache', '1700000000000x002', jsonb_build_object(
     '_id', '1700000000000x002',
     'Titre', 'Dossier transmis.',
     'Date', '2026-05-02T10:00:00.000Z',
     'ETAT', 'Terminer',
     'Num CANDIDAT tach', jsonb_build_array('cand-0023-rosa'),
     'Created By', 'ref-0023-inconnu',
     'Created Date', '2026-05-02T10:00:00.000Z')),
  ('tache', '1700000000000x003', jsonb_build_object(
     '_id', '1700000000000x003',
     'Titre', '',
     'Num CANDIDAT tach', jsonb_build_array('cand-0023-rosa'),
     'Created Date', '2026-06-01T09:00:00.000Z')),
  ('tache', '1700000000000x004', jsonb_build_object(
     '_id', '1700000000000x004',
     'Titre', 'Premier contact.',
     'Date', '2026-06-20T07:30:00.000Z',
     'ETAT', 'En attente',
     'Num CANDIDAT tach', jsonb_build_array('cand-0023-sami'),
     'Created By', 'ref-0023-paul',
     'Created Date', '2026-06-20T07:30:00.000Z'))
on conflict (type_bubble, bubble_id) do update set donnees = excluded.donnees;

-- ---------------------------------------------------------------------------
\echo '— le depliage retrouve le candidat, l auteur et le jour'
-- ---------------------------------------------------------------------------
select deversees, creees, sans_candidat, sans_auteur
  from public.deverser_taches_bubble() \gset

select public.verifier(
  :deversees = 3 and :creees = 3,
  'trois tâches sur quatre entrent dans le journal');

select public.verifier(
  :sans_candidat = 1,
  'et la quatrième attend : son candidat n''est pas en base');

-- L'une porte une signature qui ne correspond à aucune fiche, l'autre n'en
-- porte aucune. Les deux entrent dans le journal, non signées.
select public.verifier(
  :sans_auteur = 2,
  'deux tâches sont écrites sans auteur — signature inconnue, ou absente');

select public.verifier(
  (select count(*) from public.suivi where candidat_id = :'rosa'::uuid) = 3,
  'les trois lignes se rattachent bien à Rosa');

-- Minuit à Paris, c'est 23 h la veille en UTC. Un serveur qui l'ignore range
-- cette tâche au 14 mars.
select public.verifier(
  (select fait_le from public.suivi where bubble_id = '1700000000000x001')
    = date '2026-03-15',
  'la date est ramenée au jour civil français, pas à celui d''UTC');

select public.verifier(
  (select auteur_id from public.suivi where bubble_id = '1700000000000x001')
    = (select id from public.referent where bubble_id = 'ref-0023-paul'),
  'l''auteur est la fiche de référent, retrouvée par son identifiant Bubble');

select public.verifier(
  (select auteur_id from public.suivi where bubble_id = '1700000000000x002') is null,
  'un auteur introuvable laisse la ligne, sans la signer');

select public.verifier(
  (select array_agg(etat order by fait_le)
     from public.suivi where candidat_id = :'rosa'::uuid)
    = array['En cours', 'Terminer', null]::text[],
  'l''état de Bubble est conservé tel quel, et reste vide quand il l''était');

select public.verifier(
  (select texte from public.suivi where bubble_id = '1700000000000x003')
    = '(tâche sans intitulé)'
  and (select fait_le from public.suivi where bubble_id = '1700000000000x003')
    = date '2026-06-01',
  'sans intitulé ni date, la ligne est gardée quand même — repliée sur sa création');

-- ---------------------------------------------------------------------------
\echo '— l etat remonte jusqu a l ecran, par les deux fonctions de lecture'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000031"}';

  select public.verifier(
    (select etat from public.suivi_du_candidat(:'rosa'::uuid)
      where texte = 'Relance de l''entreprise, sans réponse.') = 'En cours',
    'la fiche rend l''état de la tâche');

  select public.verifier(
    (select etat from public.suivi_de_la_loge()
      where texte = 'Dossier transmis.') = 'Terminer',
    'la liste de la loge aussi');
commit;

-- ---------------------------------------------------------------------------
\echo '— il se rejoue sans doubler, et rattrape ce qui manquait'
-- ---------------------------------------------------------------------------
-- Une correction faite dans Bubble entre deux reprises.
update public.bubble_brut
   set donnees = jsonb_set(donnees, '{ETAT}', '"Terminer"')
 where type_bubble = 'tache' and bubble_id = '1700000000000x001';

select deversees as d2, creees as c2 from public.deverser_taches_bubble() \gset

select public.verifier(
  :d2 = 3 and :c2 = 0,
  'un second passage réécrit les mêmes trois lignes, et n''en crée aucune');

select public.verifier(
  (select count(*) from public.suivi where bubble_id like '1700000000000x%') = 3,
  'le journal ne compte toujours que trois lignes venues de Bubble');

select public.verifier(
  (select etat from public.suivi where bubble_id = '1700000000000x001') = 'Terminer',
  'et la correction faite dans Bubble est reprise');

-- Sami arrive. Sa tâche l'attendait depuis le premier passage.
insert into public.candidat (bubble_id, numero, nom, prenom, ville, loge_id) values
  ('cand-0023-sami', 602, 'Sami', 'S', 'Lyon',
   (select id from public.loge where bubble_id = 'loge-0023-lyon'))
on conflict do nothing;

select deversees as d3, creees as c3, sans_candidat as s3
  from public.deverser_taches_bubble() \gset

select public.verifier(
  :d3 = 4 and :c3 = 1 and :s3 = 0,
  'le candidat arrivé depuis, sa tâche le rejoint — rien n''était perdu');

-- ---------------------------------------------------------------------------
\echo '— une note ecrite dans HERACLES n est pas touchee'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000031"}';

  insert into public.suivi (candidat_id, auteur_id, fait_le, nature, texte) values
    (:'rosa'::uuid,
     (select id from public.referent where bubble_id = 'ref-0023-paul'),
     date '2026-07-01', 'Appel', 'Écrit dans HERACLES, pas dans Bubble.');
commit;

select public.deverser_taches_bubble();

select public.verifier(
  (select count(*) from public.suivi
    where texte = 'Écrit dans HERACLES, pas dans Bubble.'
      and bubble_id is null and etat is null and nature = 'Appel') = 1,
  'la note maison garde sa nature, son texte, et reste sans état');

-- ---------------------------------------------------------------------------
\echo '— le depliage n est pas a la portee de l application'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"aaaaaaaa-3333-0000-0000-000000000031"}', true);
  begin
    perform public.deverser_taches_bubble();
    raise exception 'ÉCHEC — un référent a pu lancer la reprise des tâches';
  exception when insufficient_privilege then
    raise notice '  ok — déverser est une opération d''exploitation, pas un écran';
  end;
end
$$;

do $$
begin
  set local role anon;
  begin
    perform public.deverser_taches_bubble();
    raise exception 'ÉCHEC — la reprise des tâches répond sans session';
  exception when insufficient_privilege then
    raise notice '  ok — anon non plus';
  end;
end
$$;

-- La réserve brute, elle, ne s'est jamais ouverte : c'est là que dorment les
-- tâches des candidats qu'on n'accompagne pas.
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"aaaaaaaa-3333-0000-0000-000000000031"}', true);
  begin
    perform count(*) from public.bubble_brut;
    raise exception 'ÉCHEC — un référent lit la réserve brute';
  exception when insufficient_privilege then
    raise notice '  ok — bubble_brut reste fermée à tout le monde';
  end;
end
$$;

\echo ''
\echo 'Tous les contrôles de 0023_taches_bubble.sql sont passés.'
