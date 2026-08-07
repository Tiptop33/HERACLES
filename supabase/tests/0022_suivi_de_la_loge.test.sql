-- Tests de la migration 0022_suivi_de_la_loge.sql.
--
-- Une seule chose à prouver, et elle est double : la liste rend bien tout ce
-- qu'on a le droit de lire — sinon elle ne sert à rien — et rien de plus —
-- sinon elle ouvre par la bande ce que la fiche referme.
--
-- Elle réemploie les personnes de 0021 : Karim et Lise à Brest, Marc à Nantes,
-- Nina à l'administration. On y ajoute un second candidat brestois, suivi par
-- Lise, pour que la liste ait deux dossiers à mettre bout à bout.

\set ON_ERROR_STOP on
\o /dev/null

select id as nadia   from public.candidat where bubble_id = 'cand-0021-nadia' \gset
select id as r_karim from public.referent where bubble_id = 'ref-0021-karim'  \gset
select id as r_lise  from public.referent where bubble_id = 'ref-0021-lise'   \gset

insert into public.candidat (bubble_id, numero, nom, prenom, ville, loge_id, referent_id) values
  ('cand-0022-paul', 503, 'Paul', 'P', 'Brest',
   (select id from public.loge where bubble_id = 'loge-0021-brest'),
   (select id from public.referent where bubble_id = 'ref-0021-lise'))
on conflict do nothing;

select id as paul from public.candidat where bubble_id = 'cand-0022-paul' \gset

-- Lise écrit sur le sien. Karim avait déjà écrit deux fois sur Nadia (0021).
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000028"}';
  insert into public.suivi (candidat_id, auteur_id, fait_le, nature, texte) values
    (:'paul'::uuid, :'r_lise'::uuid, date '2026-05-20', 'Appel', 'Reprise de contact.');
commit;

-- ---------------------------------------------------------------------------
\echo '— la liste met bout a bout ce qu on lirait fiche par fiche'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000027"}';

  -- Karim n'accompagne que Nadia, mais Paul est de sa loge : il voit les
  -- trois notes, exactement comme s'il ouvrait les deux fiches.
  select public.verifier(
    (select count(*) from public.suivi_de_la_loge()) = 3
      and (select count(distinct candidat_id) from public.suivi_de_la_loge()) = 2,
    'Karim lit les trois notes de sa loge, sur deux candidats');

  -- Du plus récent au plus ancien, tous candidats confondus : c'est l'ordre
  -- qui répond à « qu'est-ce qui a bougé cette semaine ? ».
  select public.verifier(
    (select array_agg(fait_le) from public.suivi_de_la_loge())
      = array[date '2026-05-20', date '2026-04-02', date '2026-03-12'],
    'et du plus récent au plus ancien, tous candidats confondus');

  select public.verifier(
    (select count(*) from public.suivi_de_la_loge() where c_est_moi) = 2,
    'deux de ces notes sont les siennes, une est de Lise');
commit;

-- ---------------------------------------------------------------------------
\echo '— elle n ouvre rien que la fiche refermerait'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000029"}';

  -- Marc est à Nantes. La liste ne lui donne rien de Brest — c'est la même
  -- règle que la fiche, et c'est tout l'objet du contrôle.
  select public.verifier(
    (select count(*) from public.suivi_de_la_loge()) = 0,
    'Marc n''obtient rien : la liste applique la règle de la fiche, pas une autre');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000030"}';

  select public.verifier(
    (select count(*) from public.suivi_de_la_loge()) >= 3,
    'l''administration voit au moins les trois — elle voit toutes les loges');
commit;

-- ---------------------------------------------------------------------------
\echo '— ce que la liste rend, et ce qu elle ne rend pas'
-- ---------------------------------------------------------------------------
-- Du candidat, elle ne rend que l'identifiant. Le nom, le numéro et le métier
-- viennent de `candidats_de_la_loge()`, qui les rend déjà : deux fonctions,
-- deux responsabilités, et aucune colonne à tenir d'accord en deux endroits.
select public.verifier(
  (select count(*) from information_schema.routines r
     join information_schema.parameters p on p.specific_name = r.specific_name
    where r.routine_schema = 'public' and r.routine_name = 'suivi_de_la_loge'
      and p.parameter_name in ('nom', 'prenom', 'numero', 'email', 'telephone')) = 0,
  'du candidat, elle ne rend que son identifiant');

-- ---------------------------------------------------------------------------
\echo '— et rien de tout cela sans etre connecte'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role anon;
  begin
    perform public.suivi_de_la_loge();
    raise exception 'ÉCHEC — la liste répond sans session';
  exception when insufficient_privilege then
    raise notice '  ok — anon n''a pas le droit d''appeler la fonction';
  end;
end
$$;

\echo ''
\echo 'Tous les contrôles de 0022_suivi_de_la_loge.sql sont passés.'
