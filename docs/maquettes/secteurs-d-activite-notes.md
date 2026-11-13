# Maquette « secteurs d'activité » — ce qui est retenu

Maquette : `secteurs-d-activite.html`, validée le 12 novembre 2026. Un seul
fichier, à ouvrir dans un navigateur : la feuille de style de l'application y
est recopiée, la nomenclature NAF y est embarquée, et la recherche y suit les
mêmes règles que `public.rechercher_secteur` (migration 0090). Les personnes
qui la peuplent sont inventées.

Ce qui est nouveau y est encadré en pointillé ; le reste de l'écran est grisé.

## 1. Formulaire de candidature — validé tel quel

- Sous « Métier visé », un champ « Secteurs d'activité » : jusqu'à trois, le
  premier est le secteur principal.
- On les trouve par un mot ou un code (recherche), ou en parcourant la liste :
  grands secteurs à gauche, divisions à droite, ou le grand secteur entier.
- Chaque proposition dit par quel intitulé elle a été trouvée.
- ↑ ↓ changent l'ordre, ✕ retire.
- En bas des propositions, toujours : « Décrivez l'activité de l'entreprise
  plutôt que le métier, ou parcourez la liste ».
- Les secteurs partent avec la fiche, au bouton « Envoyer ma fiche ».

## 2. Fiche candidat — bloc « Sa recherche »

- La ligne « Secteur » (texte libre repris de Bubble) devient la liste des
  secteurs, classés.
- **Ils se modifient directement dans la fiche** : ajouter, retirer, réordonner,
  confirmer. Chaque geste s'enregistre aussitôt, sans bouton « Enregistrer ».
  C'est le premier champ de la fiche qui se modifie sur place ; les autres
  passent toujours par « Corriger la fiche ».
- Un secteur proposé par le candidat porte « proposé par le candidat · à
  confirmer » et un bouton « Confirmer ». Ce que le référent ajoute ou modifie
  est confirmé d'office.
- Un autre référent de la loge voit la liste en lecture seule.
- **La ligne grise « Repris de Bubble : « … » »** s'affiche tant que le
  référent n'a pas confirmé les secteurs, puis disparaît.

## 3. Page Référents — bloc « Secteurs représentés »

> **Remplacé le 13 novembre 2026.** Ce bloc reposait sur une confusion entre les
> 3 loges de HERACLES et les 73 loges du réseau. Il a été retiré avant toute mise
> en ligne ; la page Référents est restée telle qu'elle était. Les secteurs sont
> cochés par le Secrétaire de chaque loge du réseau, sur sa propre page :
> voir `loges-du-reseau-notes.md`. Le choix des secteurs décrit ci-dessous y est
> repris tel quel.

- Un bloc repliable au-dessus des fiches de l'annuaire.
- Le Secrétaire **coche les secteurs présents** dans sa loge : ni nombre, ni
  nom. Au moins la division, puis aussi précis qu'il le veut, jusqu'à la
  sous-classe.
- Les secteurs cochés sont rangés par grand secteur ; ✕ décoche.
- On coche par la recherche (qui propose aussi les niveaux fins) ou par
  l'arborescence complète, dépliable ; un nœud replié dit combien de secteurs
  sont cochés dessous.
- La date de la liste s'affiche, en ambre au-delà de six mois sans mise à jour.
- Chaque geste s'enregistre aussitôt.
- Les autres référents voient la liste en lecture seule (« Tenu par le
  Secrétaire de la loge »).

## Décidé après la maquette, puis remplacé

- **Interroger chaque loge** : tant que sa loge n'a rien coché, le Secrétaire
  voit un bandeau en haut de son espace — « Indiquez les secteurs présents dans
  votre loge ». L'administration voit les 73 loges : celles qui ont répondu, à
  quelle date, et celles qui ne l'ont pas encore fait. Pas de courriel pour
  l'instant. L'emplacement exact du bandeau et du suivi reste à montrer avant
  d'être construit.
