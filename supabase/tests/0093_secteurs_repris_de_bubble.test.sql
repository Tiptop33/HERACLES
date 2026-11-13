-- Tests de la migration 0093_secteurs_repris_de_bubble.sql.
--
-- Qui est qui :
--   · Ada     administratrice — voit la liste, valide, change, écarte
--   · Rémi    référent        — ne voit rien de cet écran
--
-- Les fiches, toutes fabriquées (aucune personne, aucun secteur réel) :
--   · f1  liste ROME « r1 »                       — reçoit la correspondance
--   · f2  liste ROME « r1 », secteur déjà confirmé — n'est pas touchée
--   · f3  liste ROME « r1 », secteur du candidat   — n'est pas touchée
--   · f4  texte « Électricité générale 0093 »
--   · f5  texte « electricite  generale 0093 »     — même secteur Bubble que f4
--   · f6  code NAF de Bubble « 43.21A »           — reçoit « 43 » d'office
--   · f7  liste ROME « r2 », absente de la réserve brute
--   · f8  texte « Autre »                         — rien n'est proposé

\set ON_ERROR_STOP on
\o /dev/null

\set ada  'cccccccc-0093-0000-0000-000000000001'
\set remi 'cccccccc-0093-0000-0000-000000000002'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'ada',  'ada0093@example.org',  '{"role":"referent"}'),
  (:'remi', 'remi0093@example.org', '{"role":"referent"}')
on conflict (id) do nothing;
update public.profil set role = 'admin' where id = :'ada';

insert into public.loge (bubble_id, nom) values ('loge-0093', 'Loge — 0093')
on conflict (bubble_id) do nothing;
select id as loge from public.loge where bubble_id = 'loge-0093' \gset

insert into public.referent (bubble_id, profil_id, nom, prenom, loge_id) values
  ('ref-0093-remi', :'remi', 'REMI', 'Rémi', :'loge'::uuid)
on conflict (bubble_id) do nothing;
select id as r_remi from public.referent where bubble_id = 'ref-0093-remi' \gset

-- Les deux listes Bubble, telles que la reprise les recopie.
insert into public.bubble_brut (type_bubble, bubble_id, donnees) values
  ('secteuractiviterome', 'rome-0093-r1',
   '{"_id":"rome-0093-r1","CODE_COMBINE":"X","INTITULE_ROME":"Hôtellerie - Restauration"}'),
  ('codes_naf', 'naf-0093-1',
   '{"_id":"naf-0093-1","code_naf":"43.21A","division":"43","section":"F","libelle":"Essai"}')
on conflict (type_bubble, bubble_id) do nothing;

insert into public.candidat (bubble_id, nom, prenom, loge_id, referent_id,
                             secteur_activite_rome_bubble_id, secteur_activite_libelle, code_naf_bubble_id) values
  ('cand-0093-f1', 'Essai', 'Un',     :'loge'::uuid, :'r_remi'::uuid, 'rome-0093-r1', null, null),
  ('cand-0093-f2', 'Essai', 'Deux',   :'loge'::uuid, :'r_remi'::uuid, 'rome-0093-r1', null, null),
  ('cand-0093-f3', 'Essai', 'Trois',  :'loge'::uuid, :'r_remi'::uuid, ' rome-0093-r1 ', null, null),
  ('cand-0093-f4', 'Essai', 'Quatre', :'loge'::uuid, :'r_remi'::uuid, null, '  Électricité générale 0093 ', null),
  ('cand-0093-f5', 'Essai', 'Cinq',   :'loge'::uuid, :'r_remi'::uuid, null, 'electricite  generale 0093', null),
  ('cand-0093-f6', 'Essai', 'Six',    :'loge'::uuid, :'r_remi'::uuid, null, null, 'naf-0093-1'),
  ('cand-0093-f7', 'Essai', 'Sept',   :'loge'::uuid, :'r_remi'::uuid, 'rome-0093-r2', null, null),
  ('cand-0093-f8', 'Essai', 'Huit',   :'loge'::uuid, :'r_remi'::uuid, null, 'Autre', null)
on conflict (bubble_id) do nothing;
select id as f1 from public.candidat where bubble_id = 'cand-0093-f1' \gset
select id as f2 from public.candidat where bubble_id = 'cand-0093-f2' \gset
select id as f3 from public.candidat where bubble_id = 'cand-0093-f3' \gset
select id as f4 from public.candidat where bubble_id = 'cand-0093-f4' \gset
select id as f6 from public.candidat where bubble_id = 'cand-0093-f6' \gset

-- f2 : un secteur confirmé par son référent ; f3 : un secteur proposé par le candidat.
insert into public.candidat_secteur (candidat_id, rang, code, propose_par, confirme_par, confirme_le) values
  (:'f2'::uuid, 1, '62', 'referent', :'r_remi'::uuid, now()),
  (:'f3'::uuid, 1, '47', 'candidat', null, null)
on conflict do nothing;

-- Ce que les fiches portent, en une ligne : « code:origine:à confirmer ».
create or replace function pg_temp.secteurs(la_fiche uuid) returns text language sql as $$
  select coalesce(string_agg(code || ':' || propose_par || ':' || (confirme_le is null)::text, ' ' order by rang), '')
    from public.candidat_secteur where candidat_id = la_fiche
$$;

-- Une ligne de la liste de l'écran.
create or replace function pg_temp.ligne(liste jsonb, la_source text, la_valeur text) returns jsonb language sql as $$
  select e from jsonb_array_elements(liste) e where e ->> 'source' = la_source and e ->> 'valeur' = la_valeur
$$;

-- ===========================================================================
\echo '— la clé d''un texte libre'
select public.verifier(public.cle_de_secteur_bubble('  Électricité   GÉNÉRALE ') = 'electricite generale',
  'accents, majuscules et blancs ne comptent pas');
select public.verifier(public.cle_de_secteur_bubble('   ') is null, 'un texte blanc n''est pas un secteur');

\echo '— la proposition'
select public.verifier(public.proposer_un_secteur_bubble('Hôtellerie - Restauration')
                       = '{"code":"I","mot":"restauration"}'::jsonb,
  '« Hôtellerie - Restauration » : rien en entier, « restauration » propose I');
select public.verifier(public.proposer_un_secteur_bubble('Enseignement') ->> 'code' = 'P'
                       and public.proposer_un_secteur_bubble('Enseignement') -> 'mot' = 'null'::jsonb,
  '« Enseignement » : trouvé en entier');
select public.verifier(public.proposer_un_secteur_bubble('Autre') is null
                       and public.proposer_un_secteur_bubble('Autres') is null,
  '« Autre » ne propose rien');
select public.verifier(public.proposer_un_secteur_bubble(null) is null, 'un intitulé absent ne propose rien');

-- ===========================================================================
\echo '— le code NAF de Bubble passe d''office'
select public.verifier(public.appliquer_les_secteurs_bubble() >= 1, 'une fiche au moins a changé');
select public.verifier(pg_temp.secteurs(:'f6') = '43:reprise:true',
  'f6 reçoit la division de son code NAF, repris de Bubble, à confirmer');
select public.verifier(pg_temp.secteurs(:'f1') = '', 'f1 n''a rien tant que rien n''est validé');
select public.verifier(public.appliquer_les_secteurs_bubble() = 0, 'rejouer ne change rien');

-- ===========================================================================
\echo '— Rémi, référent : cet écran ne le concerne pas'
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"' || :'remi' || '"}', true);
  do $$
  begin
    begin
      perform public.secteurs_repris_de_bubble();
      raise exception 'ÉCHEC — un référent a lu la liste';
    exception when insufficient_privilege then
      raise notice '  ok — refusé : la liste, à un référent';
    end;
    begin
      perform public.regler_un_secteur_bubble('rome', 'rome-0093-r1', 'I');
      raise exception 'ÉCHEC — un référent a validé';
    exception when insufficient_privilege then
      raise notice '  ok — refusé : valider, à un référent';
    end;
    begin
      perform 1 from public.secteur_bubble;
      raise exception 'ÉCHEC — la table se lit';
    exception when insufficient_privilege then
      raise notice '  ok — refusé : la table elle-même';
    end;
    begin
      perform public.appliquer_les_secteurs_bubble();
      raise exception 'ÉCHEC — un référent a lancé l''application';
    exception when insufficient_privilege then
      raise notice '  ok — refusé : appliquer, hors de l''écran';
    end;
  end
  $$;
commit;

-- ===========================================================================
\echo '— Ada, administratrice : la liste'
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"' || :'ada' || '"}', true);
  select public.secteurs_repris_de_bubble() as liste \gset

  select public.verifier(
    pg_temp.ligne(:'liste', 'rome', 'rome-0093-r1') @> '{"libelle":"Hôtellerie - Restauration","fiches":3,"etat":"a_valider","code":null}'
      and pg_temp.ligne(:'liste', 'rome', 'rome-0093-r1') -> 'propose' @> '{"code":"I","niveau":"section","mot":"restauration"}',
    'r1 : son intitulé, trois fiches (blancs compris), à valider, I proposé d''après « restauration »');
  select public.verifier(
    pg_temp.ligne(:'liste', 'texte', 'electricite generale 0093') ->> 'fiches' = '2',
    'f4 et f5 : un seul secteur Bubble, deux fiches');
  select public.verifier(
    pg_temp.ligne(:'liste', 'rome', 'rome-0093-r2') @> '{"libelle":null,"propose":null,"etat":"a_valider"}',
    'r2 : absent de la réserve brute, sans intitulé ni proposition');
  select public.verifier(
    pg_temp.ligne(:'liste', 'texte', 'autre') -> 'propose' = 'null'::jsonb,
    '« Autre » : rien de proposé');
  select public.verifier(
    not exists (select 1 from jsonb_array_elements(:'liste'::jsonb) e where e ->> 'valeur' like 'naf-0093%'),
    'le code NAF de Bubble n''est pas dans la liste : il passe d''office');
commit;

-- ===========================================================================
\echo '— Ada valide : la correspondance s''applique aussitôt'
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"' || :'ada' || '"}', true);
  select public.regler_un_secteur_bubble('rome', 'rome-0093-r1', 'I') as liste \gset
  select public.verifier(
    pg_temp.ligne(:'liste', 'rome', 'rome-0093-r1') @> '{"etat":"valide","propose":null}'
      and pg_temp.ligne(:'liste', 'rome', 'rome-0093-r1') -> 'code' ->> 'code' = 'I'
      and pg_temp.ligne(:'liste', 'rome', 'rome-0093-r1') ->> 'valide_le' is not null,
    'la liste rendue dit « validé », avec sa date');
commit;

select public.verifier(pg_temp.secteurs(:'f1') = 'I:reprise:true', 'f1 reçoit I, repris de Bubble, à confirmer');
select public.verifier(pg_temp.secteurs(:'f2') = '62:referent:false', 'f2, déjà confirmée, n''est pas touchée');
select public.verifier(pg_temp.secteurs(:'f3') = '47:candidat:true', 'f3, proposée par le candidat, n''est pas touchée');
select public.verifier((select valide_par from public.secteur_bubble where valeur = 'rome-0093-r1') = :'ada'::uuid,
  'la décision garde qui l''a prise');

\echo '— sur la fiche, la ligne grise dit ce que Bubble portait'
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"' || :'remi' || '"}', true);
  select public.verifier(
    public.secteurs_du_candidat(:'f1'::uuid) ->> 'repris_de_bubble' = 'Hôtellerie - Restauration',
    'f1, sans texte libre : l''intitulé ROME');
  select public.verifier(
    public.secteurs_du_candidat(:'f4'::uuid) ->> 'repris_de_bubble' = 'Électricité générale 0093',
    'f4 : le texte libre, d''abord');
  select public.verifier(
    public.secteurs_du_candidat(:'f6'::uuid) -> 'repris_de_bubble' = 'null'::jsonb,
    'f6, ni texte ni ROME : pas de ligne grise');
commit;

\echo '— Ada change d''avis'
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"' || :'ada' || '"}', true);
  select public.regler_un_secteur_bubble('rome', 'rome-0093-r1', '56');
commit;
select public.verifier(pg_temp.secteurs(:'f1') = '56:reprise:true', 'f1 suit : 56 remplace I');

\echo '— le texte libre, et deux secteurs sur une fiche'
update public.candidat set code_naf_bubble_id = 'naf-0093-1' where id = :'f4';
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"' || :'ada' || '"}', true);
  select public.regler_un_secteur_bubble('texte', 'electricite generale 0093', 'D');
commit;
select public.verifier(pg_temp.secteurs(:'f4') = '43:reprise:true D:reprise:true',
  'f4 : le code NAF de Bubble d''abord, le texte ensuite');
select public.verifier(
  (select string_agg(code, ' ') from public.candidat_secteur cs join public.candidat c on c.id = cs.candidat_id
    where c.bubble_id = 'cand-0093-f5') = 'D',
  'f5, même texte autrement écrit, reçoit D');

\echo '— le référent reclasse sans confirmer : on laisse'
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"' || :'remi' || '"}', true);
  select public.ecrire_les_secteurs_du_candidat(:'f4'::uuid, array['D', '43']);
commit;
select public.verifier(public.appliquer_les_secteurs_bubble() = 0
                       and pg_temp.secteurs(:'f4') = 'D:reprise:true 43:reprise:true',
  'le même ensemble dans un autre ordre n''est pas réécrit');

\echo '— une fois confirmée, la fiche est à son référent'
update public.candidat_secteur set confirme_le = now(), confirme_par = :'r_remi'::uuid
 where candidat_id = :'f1';
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"' || :'ada' || '"}', true);
  select public.regler_un_secteur_bubble('rome', 'rome-0093-r1', 'F');
commit;
select public.verifier(pg_temp.secteurs(:'f1') = '56:reprise:false', 'f1, confirmée, garde 56');

\echo '— « Aucun ne convient »'
update public.candidat_secteur set confirme_le = null, confirme_par = null where candidat_id = :'f1';
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"' || :'ada' || '"}', true);
  select public.regler_un_secteur_bubble('rome', 'rome-0093-r1', null) as liste \gset
  select public.verifier(
    pg_temp.ligne(:'liste', 'rome', 'rome-0093-r1') @> '{"etat":"sans","code":null,"propose":null}',
    'la ligne dit « sans correspondance »');
commit;
select public.verifier(pg_temp.secteurs(:'f1') = '', 'f1 perd le secteur repris : il ne reste que le texte de Bubble');

\echo '— ce que la base refuse'
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"' || :'ada' || '"}', true);
  do $$
  begin
    begin
      perform public.regler_un_secteur_bubble('rome', 'rome-0093-r1', '43.21');
      raise exception 'ÉCHEC — un groupe a été retenu';
    exception when check_violation then
      raise notice '  ok — refusé : un groupe, trop fin pour un candidat';
    end;
    begin
      perform public.regler_un_secteur_bubble('rome', 'rome-0093-r1', 'ZZ');
      raise exception 'ÉCHEC — un code inconnu a été retenu';
    exception when foreign_key_violation then
      raise notice '  ok — refusé : un code inconnu';
    end;
    begin
      perform public.regler_un_secteur_bubble('rome', 'rome-0093-inconnu', 'F');
      raise exception 'ÉCHEC — un secteur Bubble absent des fiches a été réglé';
    exception when no_data_found then
      raise notice '  ok — refusé : un secteur qu''aucune fiche ne porte';
    end;
    begin
      perform public.regler_un_secteur_bubble('metier', 'rome-0093-r1', 'F');
      raise exception 'ÉCHEC — une source inconnue a été réglée';
    exception when no_data_found then
      raise notice '  ok — refusé : une source inconnue';
    end;
  end
  $$;
commit;

\echo '— personne d''autre'
begin;
  set local role anon;
  do $$
  begin
    perform public.secteurs_repris_de_bubble();
    raise exception 'ÉCHEC — anon a lu la liste';
  exception when insufficient_privilege then
    raise notice '  ok — refusé : la liste, sans session';
  end
  $$;
commit;

-- Les fiches d'essai ne restent pas : d'autres tests comptent les fiches.
delete from public.candidat where bubble_id like 'cand-0093-%';
delete from public.secteur_bubble where valeur like 'rome-0093-%' or valeur like '%0093';
delete from public.bubble_brut where bubble_id in ('rome-0093-r1', 'naf-0093-1');
delete from public.referent where bubble_id = 'ref-0093-remi';
delete from public.loge where bubble_id = 'loge-0093';

\o
\echo '0093 — secteurs repris de Bubble : tout est vert'
