-- ---------------------------------------------------------------------------
-- 0087 — les 21 secteurs d'activité
--
-- Ce que ça change : la table `code_naf` (0086) reçoit les 21 grands secteurs
-- d'activité de la nomenclature, les sections NAF de A à U — « F —
-- Construction », « I — Hébergement et restauration »… Un secteur, un code
-- d'une lettre, son intitulé officiel.
--
-- D'où viennent les données : la nomenclature NAF rév. 2 de l'INSEE, fichier
-- « Niveau 1 — Liste des sections » (naf2008_liste_n1.xls), recopié à
-- l'identique. Une nomenclature publique : aucune donnée personnelle.
--
-- Pourquoi la rév. 2 et pas la NAF 2025 : c'est celle que portent aujourd'hui
-- les entreprises du répertoire Sirene, les offres France Travail et les
-- fiches reprises de Bubble. La NAF 2025 découpe autrement certaines sections
-- (l'information et la communication y deviennent deux secteurs) ; l'adopter
-- se fera par une migration à part, le jour où les données qui arrivent la
-- porteront.
--
-- Seulement les sections : les niveaux plus fins (divisions « 43 », sous-classes
-- « 43.21A »…) pourront s'ajouter dans la même table, dont la clé admet tous
-- les niveaux.
--
-- Rejouable : `on conflict do nothing`. Un intitulé corrigé à la main en base
-- n'est pas écrasé au déploiement suivant.
-- ---------------------------------------------------------------------------

insert into public.code_naf (code, intitule) values
  ('A', 'Agriculture, sylviculture et pêche'),
  ('B', 'Industries extractives'),
  ('C', 'Industrie manufacturière'),
  ('D', 'Production et distribution d''électricité, de gaz, de vapeur et d''air conditionné'),
  ('E', 'Production et distribution d''eau ; assainissement, gestion des déchets et dépollution'),
  ('F', 'Construction'),
  ('G', 'Commerce ; réparation d''automobiles et de motocycles'),
  ('H', 'Transports et entreposage'),
  ('I', 'Hébergement et restauration'),
  ('J', 'Information et communication'),
  ('K', 'Activités financières et d''assurance'),
  ('L', 'Activités immobilières'),
  ('M', 'Activités spécialisées, scientifiques et techniques'),
  ('N', 'Activités de services administratifs et de soutien'),
  ('O', 'Administration publique'),
  ('P', 'Enseignement'),
  ('Q', 'Santé humaine et action sociale'),
  ('R', 'Arts, spectacles et activités récréatives'),
  ('S', 'Autres activités de services'),
  ('T', 'Activités des ménages en tant qu''employeurs ; activités indifférenciées des ménages en tant que producteurs de biens et services pour usage propre'),
  ('U', 'Activités extra-territoriales')
on conflict (code) do nothing;
