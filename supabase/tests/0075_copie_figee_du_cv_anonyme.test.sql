-- Tests de la migration 0075_copie_figee_du_cv_anonyme.sql.
--
--   · Lina   référente du dossier 7501, à Auch-0075 — valide et fige
--   · Marc   autre référent d'Auch-0075              — fige aussi
--   · Nino   référent de Dax-0075, parrain du dossier — voit la copie, ne fige pas
--   · Olga   référente de Dax-0075                   — ne voit rien
--   · Ines   administratrice, sans loge              — supprime le dossier
--
-- Le lien public se teste en `anon` : c'est ainsi qu'il s'ouvre.

\set ON_ERROR_STOP on
\o /dev/null

\set lina 'cfcfcfcf-7500-0000-0000-000000000001'
\set marc 'cfcfcfcf-7500-0000-0000-000000000002'
\set nino 'cfcfcfcf-7500-0000-0000-000000000003'
\set olga 'cfcfcfcf-7500-0000-0000-000000000004'
\set ines 'cfcfcfcf-7500-0000-0000-000000000005'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'lina', 'lina0075@example.org', '{"role":"referent"}'),
  (:'marc', 'marc0075@example.org', '{"role":"referent"}'),
  (:'nino', 'nino0075@example.org', '{"role":"referent"}'),
  (:'olga', 'olga0075@example.org', '{"role":"referent"}'),
  (:'ines', 'ines0075@example.org', '{"role":"referent"}');

update public.profil set role = 'admin' where id = :'ines';

insert into public.loge (bubble_id, nom) values
  ('loge-0075-auch', 'Auch — 0075'),
  ('loge-0075-dax',  'Dax — 0075')
on conflict do nothing;
select id as l_auch from public.loge where bubble_id = 'loge-0075-auch' \gset
select id as l_dax  from public.loge where bubble_id = 'loge-0075-dax' \gset

insert into public.referent (bubble_id, profil_id, nom, prenom, loge_id) values
  ('ref-0075-lina', :'lina', 'LACOMBE', 'Lina', :'l_auch'::uuid),
  ('ref-0075-marc', :'marc', 'MARTY',   'Marc', :'l_auch'::uuid),
  ('ref-0075-nino', :'nino', 'NOGUES',  'Nino', :'l_dax'::uuid),
  ('ref-0075-olga', :'olga', 'OLIVIER', 'Olga', :'l_dax'::uuid)
on conflict do nothing;
select id as r_lina from public.referent where bubble_id = 'ref-0075-lina' \gset
select id as r_nino from public.referent where bubble_id = 'ref-0075-nino' \gset

-- 7501 : suivi par Lina, présenté par Nino, qui siège dans une autre loge.
insert into public.candidat (numero, nom, prenom, ville, loge_id, referent_id, parrain_id,
                             type_emploi, emploi_recherche, competences) values
  (7501, 'FIGE', 'Fabienne', 'Auch', :'l_auch'::uuid, :'r_lina'::uuid, :'r_nino'::uuid,
   'emploi', 'Secrétaire médicale', 'Accueil, agenda');

select id as c1, cv_anonyme_jeton as j1 from public.candidat where numero = 7501 \gset

-- ---------------------------------------------------------------------------
\echo '— avant la validation, rien a figer'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cfcfcfcf-7500-0000-0000-000000000001"}';
  select public.verifier(
    (select issue = 'non_valide' and chemin is null and ancien is null
       from public.figer_cv_anonyme(:'c1'::uuid)),
    'un CV non valide ne se fige pas');
commit;

select public.verifier(
  (select cv_anonyme_fige_chemin is null and cv_anonyme_fige_le is null
     from public.candidat where id = :'c1'::uuid),
  'et la fiche ne porte aucune copie');

-- ---------------------------------------------------------------------------
\echo '— hors de la loge, on ne fige pas'
-- ---------------------------------------------------------------------------
do $$
declare
  dossier uuid := (select id from public.candidat where numero = 7501);
  qui text;
begin
  foreach qui in array array[
    'cfcfcfcf-7500-0000-0000-000000000003',  -- le parrain, d'une autre loge
    'cfcfcfcf-7500-0000-0000-000000000004'   -- une referente d'une autre loge
  ] loop
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', qui)::text, true);
    begin
      perform public.figer_cv_anonyme(dossier);
      raise exception 'ÉCHEC — % a fige hors de sa loge', qui;
    exception when insufficient_privilege then
      raise notice '  ok — % ne fige pas hors de sa loge', qui;
    end;
  end loop;

  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '', true);
  begin
    perform public.figer_cv_anonyme(dossier);
    raise exception 'ÉCHEC — anon a fige un CV';
  exception when insufficient_privilege then
    raise notice '  ok — anon ne fige pas';
  end;
end
$$;

-- ---------------------------------------------------------------------------
\echo '— valider puis figer : un chemin calcule par la base'
-- ---------------------------------------------------------------------------
select maj_le as maj_avant from public.candidat where id = :'c1'::uuid \gset

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cfcfcfcf-7500-0000-0000-000000000001"}';
  select public.verifier(
    public.valider_cv_anonyme(:'c1'::uuid, true) = 'valide',
    'Lina valide');
  select issue as f1_issue, chemin as k1, coalesce(ancien, '') as f1_ancien
    from public.figer_cv_anonyme(:'c1'::uuid) \gset
commit;

select public.verifier(:'f1_issue' = 'fige', 'la copie de la validation est figee');
select public.verifier(
  :'k1' ~ ('^candidats/' || :'c1' || '/cv-anonyme-valide-[0-9]+\.pdf$'),
  'le chemin est rangé sous le candidat, au nom de l instant de la validation');
select public.verifier(:'f1_ancien' = '', 'aucune copie a remplacer la premiere fois');

select public.verifier(
  (select cv_anonyme_fige_chemin = :'k1'
      and cv_anonyme_fige_le = cv_anonyme_valide_le
      and maj_le = :'maj_avant'::timestamptz
     from public.candidat where id = :'c1'::uuid),
  'la fiche retient la copie et la validation qu elle fige, sans toucher maj_le');

-- ---------------------------------------------------------------------------
\echo '— la copie est servie par le lien et par la fiche'
-- ---------------------------------------------------------------------------
begin;
  set local role anon;
  select public.verifier(
    (select fige_chemin = :'k1' and valide_le is not null
       from public.cv_anonyme_valide_public(:'j1'::uuid)),
    'le lien public rend le chemin de la copie');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cfcfcfcf-7500-0000-0000-000000000002"}';
  select public.verifier(
    public.copie_figee_du_cv_anonyme(:'c1'::uuid) = :'k1',
    'un autre referent de la loge ouvre la copie');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cfcfcfcf-7500-0000-0000-000000000003"}';
  select public.verifier(
    public.copie_figee_du_cv_anonyme(:'c1'::uuid) = :'k1',
    'le parrain, qui voit la fiche, ouvre la copie');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cfcfcfcf-7500-0000-0000-000000000004"}';
  select public.verifier(
    public.copie_figee_du_cv_anonyme(:'c1'::uuid) is null,
    'une referente d une autre loge n obtient rien');
commit;

-- ---------------------------------------------------------------------------
\echo '— les colonnes ne s ecrivent pas par la table'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cfcfcfcf-7500-0000-0000-000000000001"}';
  update public.candidat
     set ville = 'Auch centre',
         cv_anonyme_fige_chemin = 'candidats/' || :'c1' || '/cv.pdf',
         cv_anonyme_fige_le = now() - interval '1 day'
   where id = :'c1'::uuid;
commit;

select public.verifier(
  (select ville = 'Auch centre'
      and cv_anonyme_fige_chemin = :'k1'
      and cv_anonyme_fige_le = cv_anonyme_valide_le
     from public.candidat where id = :'c1'::uuid),
  'la fiche se modifie, mais la copie ne se fait pas pointer ailleurs');

-- ---------------------------------------------------------------------------
\echo '— une fiche modifiee fait taire la copie'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cfcfcfcf-7500-0000-0000-000000000001"}';
  update public.candidat set emploi_recherche = 'Secrétaire médicale bilingue'
   where id = :'c1'::uuid;
commit;

begin;
  set local role anon;
  select public.verifier(
    (select count(*) from public.cv_anonyme_valide_public(:'j1'::uuid)) = 0,
    'la validation effacee, le lien ne sert plus rien');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cfcfcfcf-7500-0000-0000-000000000001"}';
  select public.verifier(
    public.copie_figee_du_cv_anonyme(:'c1'::uuid) is null,
    'ni la fiche');
commit;

select public.verifier(
  (select cv_anonyme_fige_chemin = :'k1' from public.candidat where id = :'c1'::uuid),
  'la copie reste rangee, comme trace de ce qui a ete relu');

-- ---------------------------------------------------------------------------
\echo '— une nouvelle validation, une nouvelle copie, qui remplace l ancienne'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cfcfcfcf-7500-0000-0000-000000000002"}';
  select public.verifier(
    public.valider_cv_anonyme(:'c1'::uuid, true) = 'valide',
    'Marc valide la fiche modifiee');
commit;

begin;
  set local role anon;
  select public.verifier(
    (select fige_chemin is null from public.cv_anonyme_valide_public(:'j1'::uuid)),
    'tant qu elle n est pas figee, le lien ne ressert pas l ancienne copie');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cfcfcfcf-7500-0000-0000-000000000002"}';
  select issue as f2_issue, chemin as k2, coalesce(ancien, '') as f2_ancien
    from public.figer_cv_anonyme(:'c1'::uuid) \gset
  select issue as f3_issue, chemin as k3, coalesce(ancien, '') as f3_ancien
    from public.figer_cv_anonyme(:'c1'::uuid) \gset
commit;

select public.verifier(
  :'f2_issue' = 'fige' and :'k2' <> :'k1' and :'f2_ancien' = :'k1',
  'la nouvelle copie a son propre fichier, et rend l ancien a effacer du seau');
select public.verifier(
  :'f3_issue' = 'fige' and :'k3' = :'k2' and :'f3_ancien' = '',
  'figer deux fois la meme validation ne rend rien a effacer');

begin;
  set local role anon;
  select public.verifier(
    (select fige_chemin = :'k2' from public.cv_anonyme_valide_public(:'j1'::uuid)),
    'le lien sert la nouvelle copie');
commit;

-- ---------------------------------------------------------------------------
\echo '— retirer la validation fait taire la copie'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cfcfcfcf-7500-0000-0000-000000000001"}';
  select public.verifier(
    public.valider_cv_anonyme(:'c1'::uuid, false) = 'retire',
    'Lina retire la validation');
  select public.verifier(
    (select issue = 'non_valide' from public.figer_cv_anonyme(:'c1'::uuid)),
    'il n y a plus rien a figer');
  select public.verifier(
    public.copie_figee_du_cv_anonyme(:'c1'::uuid) is null,
    'et la fiche ne sert plus la copie');
commit;

-- ---------------------------------------------------------------------------
\echo '— supprimer le dossier emporte la copie'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cfcfcfcf-7500-0000-0000-000000000005"}';
  select public.verifier(
    (select issue = 'supprime' and :'k2' = any (fichiers)
       from public.supprimer_un_candidat(:'c1'::uuid)),
    'la suppression rend le fichier de la copie, a retirer du seau');
commit;

\o
\echo '0075 — la copie figee du CV anonyme : tout est vert.'
