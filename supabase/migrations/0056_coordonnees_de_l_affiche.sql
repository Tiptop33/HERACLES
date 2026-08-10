-- ---------------------------------------------------------------------------
-- 0056 — les coordonnées imprimées au pied de l'affiche
--
-- Ce que ça change : un réglage de plus, `parametre.commission_contacts`. Ce
-- sont les lignes de contact que porte le bas de l'affiche — le président de
-- la commission, le secrétariat : nom, fonction, téléphone, adresse.
--
-- POURQUOI UN RÉGLAGE, ET NON TROIS LIGNES DANS LE CODE
--
-- Ce sont des coordonnées de personnes réelles. La règle du projet est nette :
-- aucune donnée réelle dans le dépôt, ni export, ni copie de fiche. Les écrire
-- dans un fichier source les publierait à tous ceux qui lisent le code, et
-- elles y resteraient dans l'historique même après correction.
--
-- Elles vivent donc en base, se règlent sur chaque installation, et la colonne
-- part vide. L'affiche n'imprime son pied que si quelqu'un l'a rempli — une
-- affiche sans coordonnées se remarque et se corrige ; une affiche portant
-- celles d'un autre, non.
--
-- POURQUOI UN TABLEAU DE TEXTE
--
-- Une ligne par contact, telle qu'elle doit paraître. La commission en a deux
-- aujourd'hui ; elle en aura une ou trois un jour, sans qu'il faille une
-- migration. Découper en nom, fonction, téléphone et adresse aurait figé une
-- forme que le document n'impose pas — il imprime une ligne, pas un fichier.
--
-- Ces lignes rejoindront l'écran d'administration du lot 5, avec les dates
-- d'exercice. D'ici là elles se posent en SQL, ce qui est le lot de tous les
-- réglages de cette table.
-- ---------------------------------------------------------------------------

alter table public.parametre
  add column if not exists commission_contacts text[];

comment on column public.parametre.commission_contacts is
  'Les lignes de contact imprimées au pied de l''affiche — président, '
  'secrétariat —, une par entrée et telles qu''elles doivent paraître. Vide '
  'par défaut : ce sont des coordonnées réelles, elles se règlent sur chaque '
  'installation et n''ont pas leur place dans le dépôt.';

-- La lecture est déjà ouverte à `authenticated` par `parametre_lecture` (0002),
-- et l'écriture reste fermée : ces lignes se posent par une migration ou par
-- l'écran d'administration, jamais depuis le navigateur.
