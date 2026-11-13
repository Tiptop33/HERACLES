-- Tests de la migration 0095_loges_de_guyenne_et_gascogne.sql.
--
-- Le courriel au Secrétaire dit « Guyenne et Gascogne » : par défaut, et dans
-- un texte déjà enregistré qui portait l'ancienne formule.

\set ON_ERROR_STOP on
\o /dev/null

\echo '— le texte proposé par défaut'
select public.verifier(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'parametre' and column_name = 'mot_loge_du_reseau')
    like '%à chaque loge de Guyenne et Gascogne%',
  'le défaut dit « à chaque loge de Guyenne et Gascogne »');
select public.verifier(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'parametre' and column_name = 'mot_loge_du_reseau')
    not like '%loge du réseau%',
  'et plus « loge du réseau »');

\echo '— un texte déjà enregistré'
begin;
  insert into public.parametre (id) values (true) on conflict (id) do nothing;
  update public.parametre
     set mot_loge_du_reseau = 'Bonjour {secretaire}, nous demandons à chaque loge du réseau de cocher. Mot ajouté par l''administration. {lien}';
  -- Le geste de la migration, rejoué tel quel : il doit l'être sans dommage.
  update public.parametre
     set mot_loge_du_reseau = replace(mot_loge_du_reseau, 'à chaque loge du réseau', 'à chaque loge de Guyenne et Gascogne')
   where position('à chaque loge du réseau' in mot_loge_du_reseau) > 0;
  update public.parametre
     set mot_loge_du_reseau = replace(mot_loge_du_reseau, 'à chaque loge du réseau', 'à chaque loge de Guyenne et Gascogne')
   where position('à chaque loge du réseau' in mot_loge_du_reseau) > 0;
  select public.verifier(
    (select mot_loge_du_reseau from public.parametre)
      = 'Bonjour {secretaire}, nous demandons à chaque loge de Guyenne et Gascogne de cocher. Mot ajouté par l''administration. {lien}',
    'la formule change, le reste du texte de l''administration reste ; rejouer ne change plus rien');
rollback;

\o
\echo '0095 — Loges de Guyenne et Gascogne : tout est vert'
