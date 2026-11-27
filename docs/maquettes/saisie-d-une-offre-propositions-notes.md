# Saisir une offre à la main : ce qui a été retenu

Planche : `saisie-d-une-offre-propositions.html`, cinq propositions (A à E) aux
mêmes champs. Décisions du 27 novembre 2026, posées une par une.

| # | Question | Réponse |
| --- | --- | --- |
| 1 | La présentation | **A, « La fenêtre »** : une fenêtre flottante, une colonne, ouverte par « + Saisir une offre » ; un seul bouton, « Publier l'offre » |
| 2 | La place | **L'entrée reprend son nom « Offres externes »**, à la même place et à la même adresse ; l'écran prend ce titre, le logo de France Travail disparaît du haut de l'écran |
| 3 | La marque dans la liste | **L'étiquette du type** — Emploi, Stage, Alternance — avant la date, aux couleurs des familles de recherche |
| 4 | Qui saisit | **L'administrateur et les référents** ; chacun modifie et retire les siennes, l'administrateur toutes |
| 5 | La durée de vie | **30 jours, prolongeables** ; l'offre n'est pas effacée, on la retire à tout moment |
| 6 | Le secteur | **Obligatoire** — le choix de secteur de la fiche candidat, une section ou une division |
| 7 | Le contact | **Visible des référents et des candidats** : le candidat peut postuler directement ; registre des traitements complété |
| 8 | Les offres sorties de la liste | **Un bloc sous la liste**, « Offres saisies sorties de la liste », montré seulement s'il y en a : les siennes pour un référent, toutes pour l'administrateur |
| 9 | La page du candidat | **« Les offres en cours dans vos secteurs d'activité. »**, et l'étiquette du type sur les offres saisies |

**Rectifié le même jour, après la mise en ligne** — « je me suis trompé,
offres externes c'est plutôt offres internes » :

| # | Question | Réponse |
| --- | --- | --- |
| 10 | Où vont les offres saisies | **Dans « Offres internes »**, jusque-là grisée : un écran à elles. « Offres externes » garde son nom (décision 2) et ne montre plus que France Travail |
| 11 | L'écran « Offres internes » | **Une liste simple** : le titre, « + Saisir une offre », les offres en ligne, puis celles sorties de la liste — ni recherche ni filtre |
| 12 | Combien de temps une offre sortie de la liste reste-t-elle ? | **Six mois au plus** : la purge la supprime six mois après sa sortie de la liste, si personne ne l'a prolongée ni retirée (migration 0116) |

## Ce qui en est construit

- Base : migrations `0114_offres_saisies.sql` et `0115_offres_internes.sql`, avec leurs tests.
- Écran « Offres internes » : `apps/web/src/app/espace/offres-internes/page.tsx`.
- Écran : `FenetreDeSaisieDOffre.tsx`, `SaisirUneOffre.tsx`,
  `GestesDeLOffre.tsx`, `EtiquetteDuType.tsx` ; routes `/api/offres/saisies`.
- Mode d'emploi : `docs/offres-saisies.md`.

## Ce qui diffère de la maquette

- Le secteur est un choix par recherche ou par liste, celui de la fiche
  candidat, et non le menu des 21 grands secteurs de la planche : on peut y
  prendre une division.
- Le pied de la fenêtre dit « Requis : le type, l'intitulé, l'entreprise, le
  lieu et le secteur » — le secteur est devenu requis (décision 6).
- La croix ferme sans rien enregistrer, comme Échap ; une offre publiée vide
  la fiche pour la suivante, la fenêtre reste ouverte.
- Le détail d'une offre saisie porte, pour son auteur et l'administration,
  « En ligne jusqu'au … » et trois gestes : Modifier (la même fenêtre,
  remplie), Prolonger de 30 jours, Retirer l'offre — confirmé sur place.
- Les gestes ne sont pas proposés depuis l'accueil : son détail d'offre se lit
  seulement.
