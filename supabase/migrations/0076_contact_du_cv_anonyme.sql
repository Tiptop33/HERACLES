-- ---------------------------------------------------------------------------
-- 0076 — le contact du CV anonyme : le Secrétaire de la loge, par défaut
--
-- Ce que ça change : tant qu'aucune adresse n'est réglée dans Paramètres ›
-- Mise en page › CV anonyme, la phrase « Pour rencontrer ce candidat, écrire
-- à … » porte l'adresse électronique du **Secrétaire de la loge du
-- candidat** — le référent qui porte le titre « Secrétaire » au collège, celui
-- que l'affichette nomme déjà (0067). Une adresse réglée le remplace sur tous
-- les CV. Demande du 10 novembre 2026, sur l'instance d'essai.
--
-- Le Secrétaire se lit à chaque CV : quand le titre change de mains, les CV
-- suivent sans qu'on touche aux réglages.
--
-- POURQUOI ICI
--
-- Le lien public s'ouvre sans compte : `anon` ne peut pas appeler
-- `commission_du_candidat()`. Quand la copie figée d'une validation manque
-- (0075), le PDF se refait à la demande, et il lui faut la même adresse que
-- celle de la copie. `cv_anonyme_valide_public()` la rend donc, avec le reste.
--
-- Une adresse de référent sort ainsi par le lien public — seulement celle du
-- Secrétaire, seulement pour un CV validé d'un dossier en cours, et c'est
-- exactement ce que le PDF imprime de toute façon. Rien du candidat de plus.
-- ---------------------------------------------------------------------------

-- La fonction de 0075, à l'identique, avec une colonne de plus. Le type de
-- retour change : `drop` puis `create`, à chaque passage — 0073 et 0075,
-- rejouées avant celle-ci, recréent leurs formes.
drop function if exists public.cv_anonyme_valide_public(uuid);

create function public.cv_anonyme_valide_public(jeton uuid)
returns table (
  numero                   integer,
  valide_le                timestamptz,
  type_emploi              text,
  emploi_recherche         text,
  secteur_activite_libelle text,
  metier_libelle           text,
  debut_stage              timestamptz,
  mobilite_geographique    text,
  permis_vl                text,
  vehicule                 text,
  experiences              text,
  formations               text,
  competences              text,
  savoir_etre              text,
  informatique             text,
  reglages                 jsonb,
  /** La copie de cette validation-ci, ou null : le PDF se produit alors. */
  fige_chemin              text,
  /** Le contact par défaut : l'adresse du Secrétaire de la loge du candidat. */
  secretaire_email         text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.numero,
         c.cv_anonyme_valide_le,
         c.type_emploi, c.emploi_recherche, c.secteur_activite_libelle, c.metier_libelle,
         c.debut_stage, c.mobilite_geographique, c.permis_vl, c.vehicule,
         c.experiences, c.formations, c.competences, c.savoir_etre, c.informatique,
         coalesce(m.reglages, '{}'::jsonb),
         case when c.cv_anonyme_fige_le = c.cv_anonyme_valide_le
              then c.cv_anonyme_fige_chemin end,
         nullif(btrim(s.email), '')
    from public.candidat c
    left join public.mise_en_page m on m.document = 'cv_anonyme'
    left join lateral public.officier_de_la_loge(c.loge_id, array['secrétaire']) s on true
   where c.cv_anonyme_jeton = jeton
     and c.cv_anonyme_valide_le is not null
     and public.mot_de_fermeture(c.cloture) is null
     and public.mot_de_fermeture(c.archive) is null
$$;

comment on function public.cv_anonyme_valide_public(uuid) is
  'Les champs anonymes du CV désigné par ce jeton, s''il a été validé par un '
  'référent de la loge et que le dossier est en cours, le chemin de la copie '
  'figée de cette validation (0075), et l''adresse du Secrétaire de la loge, '
  'contact par défaut du CV (0076). Ouverte à anon : le QR code de '
  'l''affichette s''ouvre sans compte.';

revoke all on function public.cv_anonyme_valide_public(uuid) from public;
grant execute on function public.cv_anonyme_valide_public(uuid) to anon, authenticated;
