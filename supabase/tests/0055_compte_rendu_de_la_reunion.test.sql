-- Tests de la migration 0055_compte_rendu_de_la_reunion.sql.
--
--   · Nadia référente à Pau-0055 — présente aux trois réunions de l'exercice
--   · Omar  référent  à Pau-0055 — présent à une, excusé le jour du compte rendu
--   · Paul  référent  à Pau-0055 — présent seulement là où ça ne compte pas
--   · Rita  référente à Dax-0055 — une autre loge

\set ON_ERROR_STOP on
\o /dev/null

\set nadia 'aaaaaaaa-5500-0000-0000-000000000191'
\set omar  'aaaaaaaa-5500-0000-0000-000000000192'
\set paul  'aaaaaaaa-5500-0000-0000-000000000193'
\set rita  'aaaaaaaa-5500-0000-0000-000000000194'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'nadia', 'nadia0055@example.org', '{"role":"referent"}'),
  (:'omar',  'omar0055@example.org',  '{"role":"referent"}'),
  (:'paul',  'paul0055@example.org',  '{"role":"referent"}'),
  (:'rita',  'rita0055@example.org',  '{"role":"referent"}');

insert into public.loge (bubble_id, nom) values
  ('loge-0055-pau', 'Pau — 0055'),
  ('loge-0055-dax', 'Dax — 0055')
on conflict do nothing;

select id as l_pau from public.loge where bubble_id = 'loge-0055-pau' \gset
select id as l_dax from public.loge where bubble_id = 'loge-0055-dax' \gset

insert into public.referent (bubble_id, profil_id, nom, prenom, email, telephone, loge_id) values
  ('ref-0055-nadia', :'nadia', 'NADIR', 'Nadia', 'nadia0055@example.org', '06 00 00 00 01', :'l_pau'::uuid),
  ('ref-0055-omar',  :'omar',  'OMBRE', 'Omar',  'omar0055@example.org',  '06 00 00 00 02', :'l_pau'::uuid),
  ('ref-0055-paul',  :'paul',  'PAULIN','Paul',  'paul0055@example.org',  '06 00 00 00 03', :'l_pau'::uuid),
  ('ref-0055-rita',  :'rita',  'RIVES', 'Rita',  'rita0055@example.org',  '06 00 00 00 04', :'l_dax'::uuid)
on conflict do nothing;

select id as r_nadia from public.referent where bubble_id = 'ref-0055-nadia' \gset
select id as r_omar  from public.referent where bubble_id = 'ref-0055-omar'  \gset
select id as r_paul  from public.referent where bubble_id = 'ref-0055-paul'  \gset

insert into public.parametre (id, date_depart, date_fin)
values (true, current_date - 60, current_date + 60)
on conflict (id) do update set date_depart = excluded.date_depart,
                               date_fin    = excluded.date_fin;

-- Les réunions sont posées directement : le test porte sur le comptage, et
-- `ouvrir_une_reunion` poserait des pointages (0053, 0054) qui le brouilleraient.
--
--   · trois dans l'exercice, dont celle qu'on imprime ;
--   · une retirée — elle n'a pas eu lieu ;
--   · une hors des bornes — elle appartient à un autre exercice.
insert into public.reunion (loge_id, tenue_le, ouverte_par) values
  (:'l_pau'::uuid, current_date - 30, :'r_nadia'::uuid),
  (:'l_pau'::uuid, current_date - 20, :'r_nadia'::uuid),
  (:'l_pau'::uuid, current_date - 10, :'r_nadia'::uuid),
  (:'l_pau'::uuid, current_date - 200, :'r_nadia'::uuid);

insert into public.reunion (loge_id, tenue_le, ouverte_par, retire_le, retire_par)
values (:'l_pau'::uuid, current_date - 40, :'r_nadia'::uuid, now(), :'r_nadia'::uuid);

insert into public.reunion (loge_id, tenue_le, ouverte_par)
values (:'l_dax'::uuid, current_date - 10, (select id from public.referent where bubble_id = 'ref-0055-rita'));

select id as une     from public.reunion where loge_id = :'l_pau'::uuid and tenue_le = current_date - 30 \gset
select id as deux    from public.reunion where loge_id = :'l_pau'::uuid and tenue_le = current_date - 20 \gset
select id as seance  from public.reunion where loge_id = :'l_pau'::uuid and tenue_le = current_date - 10 \gset
select id as vieille from public.reunion where loge_id = :'l_pau'::uuid and tenue_le = current_date - 200 \gset
select id as retiree from public.reunion where loge_id = :'l_pau'::uuid and tenue_le = current_date - 40 \gset
select id as chez_rita from public.reunion where loge_id = :'l_dax'::uuid \gset

-- Nadia aux trois. Omar à la première, excusé le jour du compte rendu. Paul
-- présent seulement à la retirée et à celle d'un autre exercice : zéro.
insert into public.appel (reunion_id, referent_id, etat, appele_par) values
  (:'une'::uuid,     :'r_nadia'::uuid, 'Présent', :'r_nadia'::uuid),
  (:'deux'::uuid,    :'r_nadia'::uuid, 'Présent', :'r_nadia'::uuid),
  (:'seance'::uuid,  :'r_nadia'::uuid, 'Présent', :'r_nadia'::uuid),
  (:'une'::uuid,     :'r_omar'::uuid,  'Présent', :'r_nadia'::uuid),
  (:'seance'::uuid,  :'r_omar'::uuid,  'Excusé',  :'r_nadia'::uuid),
  (:'retiree'::uuid, :'r_paul'::uuid,  'Présent', :'r_nadia'::uuid),
  (:'vieille'::uuid, :'r_paul'::uuid,  'Présent', :'r_nadia'::uuid);

-- ---------------------------------------------------------------------------
\echo '— le tableau des presences porte toute la loge, et personne d autre'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5500-0000-0000-000000000191"}';

  select public.verifier(
    (select count(*) from public.compte_rendu_presences(:'seance'::uuid)) = 3,
    'les trois referents de Pau');

  select public.verifier(
    (select count(*) from public.compte_rendu_presences(:'seance'::uuid)
      where nom = 'RIVES') = 0,
    'et pas Rita, qui siege a Dax');

  -- Les coordonnées sont dans le document : c'est un annuaire de séance.
  select public.verifier(
    (select email from public.compte_rendu_presences(:'seance'::uuid)
      where nom = 'OMBRE') = 'omar0055@example.org'
    and (select telephone from public.compte_rendu_presences(:'seance'::uuid)
          where nom = 'OMBRE') = '06 00 00 00 02',
    'avec e-mail et telephone');
commit;

-- ---------------------------------------------------------------------------
\echo '— l etat du jour est celui de cette reunion-la'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5500-0000-0000-000000000191"}';

  select public.verifier(
    (select etat from public.compte_rendu_presences(:'seance'::uuid) where nom = 'NADIR') = 'Présent'
    and (select etat from public.compte_rendu_presences(:'seance'::uuid) where nom = 'OMBRE') = 'Excusé'
    and (select etat from public.compte_rendu_presences(:'seance'::uuid) where nom = 'PAULIN') is null,
    'presente, excuse, et jamais appele');
commit;

-- ---------------------------------------------------------------------------
\echo '— le taux se compte sur les reunions de l exercice'
-- ---------------------------------------------------------------------------
-- Trois réunions comptent : ni la retirée, ni celle d'il y a deux cents jours.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5500-0000-0000-000000000191"}';

  select public.verifier(
    (select presences from public.compte_rendu_presences(:'seance'::uuid) where nom = 'NADIR') = 3
    and (select taux from public.compte_rendu_presences(:'seance'::uuid) where nom = 'NADIR') = 100,
    'Nadia aux trois : 100 %');

  select public.verifier(
    (select presences from public.compte_rendu_presences(:'seance'::uuid) where nom = 'OMBRE') = 1
    and (select taux from public.compte_rendu_presences(:'seance'::uuid) where nom = 'OMBRE') = 33,
    'Omar a une seule : 33 %');

  -- Le contrôle qui compte : Paul a deux « Présent » en base, et zéro ici.
  select public.verifier(
    (select presences from public.compte_rendu_presences(:'seance'::uuid) where nom = 'PAULIN') = 0
    and (select taux from public.compte_rendu_presences(:'seance'::uuid) where nom = 'PAULIN') = 0,
    'Paul, present a la retiree et hors bornes : zero');

  -- Un excusé n'est pas une présence : le document dit « PRÉSENCE % ».
  select public.verifier(
    (select presences from public.compte_rendu_presences(:'seance'::uuid) where nom = 'OMBRE') = 1,
    'et son excuse du jour ne se compte pas comme une venue');
commit;

-- ---------------------------------------------------------------------------
\echo '— la liste des candidats ne retient que le travail en cours'
-- ---------------------------------------------------------------------------
insert into public.candidat (numero, nom, prenom, loge_id, referent_id,
                             metier_libelle, emploi_recherche, cloture, archive, cree_le) values
  (900, 'DUVAL',  'Chloé', :'l_pau'::uuid, :'r_omar'::uuid,
   'Chef de travaux', 'DIRECTION DE TRAVAUX / CHEF DE TRAVAUX BTP', null, null, current_date - 120),
  (901, 'FERRAND','Luc',   :'l_pau'::uuid, :'r_omar'::uuid,
   'Comptable', 'COMPTABILITE GENERALE', 'Trouvé', null, current_date - 100),
  (902, 'GARNIER','Sara',  :'l_pau'::uuid, :'r_omar'::uuid,
   'Juriste', 'DROIT SOCIAL', null, 'Oui', current_date - 90),
  -- Le piège de Bubble : « Non » ne referme rien (0029).
  (903, 'HUET',   'Ivan',  :'l_pau'::uuid, null,
   'Technicien', 'MAINTENANCE INDUSTRIELLE', 'Non', 'Non', current_date - 80),
  (904, 'IMBERT', 'Zoé',   :'l_dax'::uuid, null,
   'Vendeuse', 'COMMERCE', null, null, current_date - 70);

-- Un CV joint sur le 900, aucun sur le 903 : c'est ce que l'affiche marque.
update public.candidat set cv_chemin = 'candidats/900/cv.pdf' where numero = 900;

select id as c_duval from public.candidat where numero = 900 \gset

insert into public.suivi (candidat_id, auteur_id, fait_le, texte) values
  (:'c_duval'::uuid, :'r_omar'::uuid, current_date - 30, 'premier contact, sans suite'),
  (:'c_duval'::uuid, :'r_omar'::uuid, current_date - 3,  'contact ce jour, attente réponse');

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5500-0000-0000-000000000191"}';

  select public.verifier(
    (select count(*) from public.dossiers_en_cours(:'seance'::uuid)) = 2,
    'deux dossiers en cours : le 900 et le 903');

  select public.verifier(
    (select count(*) from public.dossiers_en_cours(:'seance'::uuid)
      where numero in (901, 902)) = 0,
    'ni le cloture, ni l archive');

  select public.verifier(
    (select count(*) from public.dossiers_en_cours(:'seance'::uuid)
      where numero = 903) = 1,
    'mais bien celui dont Bubble dit « Non » : il n est pas referme');

  select public.verifier(
    (select count(*) from public.dossiers_en_cours(:'seance'::uuid)
      where numero = 904) = 0,
    'et rien de la loge voisine');
commit;

-- ---------------------------------------------------------------------------
\echo '— chaque dossier porte ce qu on relit en seance'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5500-0000-0000-000000000191"}';

  select public.verifier(
    (select commentaire from public.dossiers_en_cours(:'seance'::uuid) where numero = 900)
      = 'contact ce jour, attente réponse',
    'le dernier mot du journal, pas le premier');

  select public.verifier(
    (select referent_nom from public.dossiers_en_cours(:'seance'::uuid) where numero = 900) = 'OMBRE'
    and (select referent_nom from public.dossiers_en_cours(:'seance'::uuid) where numero = 903) is null,
    'le referent quand il y en a un, et rien quand il n y en a pas');

  select public.verifier(
    (select emploi from public.dossiers_en_cours(:'seance'::uuid) where numero = 900) = 'Chef de travaux'
    and (select recherche from public.dossiers_en_cours(:'seance'::uuid) where numero = 900)
          = 'DIRECTION DE TRAVAUX / CHEF DE TRAVAUX BTP',
    'le metier court et la recherche longue, comme sur le document');

  select public.verifier(
    (select ouvert_le from public.dossiers_en_cours(:'seance'::uuid) where numero = 900)
      = current_date - 120,
    'et la date d ouverture du dossier');

  -- La mention « CV » de l'affiche : elle ne dit pas ce que vaut le dossier,
  -- seulement qu'un CV y est joint.
  select public.verifier(
    (select a_un_cv from public.dossiers_en_cours(:'seance'::uuid) where numero = 900) = true
    and (select a_un_cv from public.dossiers_en_cours(:'seance'::uuid) where numero = 903) = false,
    'et la mention CV, pour celui qui en a un');
commit;

-- ---------------------------------------------------------------------------
\echo '— une reunion d une autre loge ne rend rien'
-- ---------------------------------------------------------------------------
-- Ni erreur, ni fuite : zéro ligne. On ne dit pas ce qui existe ailleurs.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5500-0000-0000-000000000191"}';

  select public.verifier(
    (select count(*) from public.compte_rendu_presences(:'chez_rita'::uuid)) = 0,
    'aucune presence pour la reunion de Dax');

  select public.verifier(
    (select count(*) from public.dossiers_en_cours(:'chez_rita'::uuid)) = 0,
    'et aucun candidat non plus');
commit;

-- ---------------------------------------------------------------------------
\echo '— et rien de tout cela sans etre connecte'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role anon;
  begin
    perform public.compte_rendu_presences('00000000-0000-0000-0000-000000000000'::uuid);
    raise exception 'ÉCHEC — anon a pu lire les presences';
  exception when insufficient_privilege then
    raise notice '  ok — anon n''a pas le droit de lire les presences';
  end;
  begin
    perform public.dossiers_en_cours('00000000-0000-0000-0000-000000000000'::uuid);
    raise exception 'ÉCHEC — anon a pu lire les candidats';
  exception when insufficient_privilege then
    raise notice '  ok — ni les candidats';
  end;
end
$$;

\echo ''
\echo 'Tous les contrôles de 0055_compte_rendu_de_la_reunion.sql sont passés.'
