# CV anonyme : ce qui a été retenu

Planche : `cv-anonyme-propositions.html`, six modèles A4 (A à F). Décisions du
10 novembre 2026, posées une par une.

| # | Question | Réponse |
| --- | --- | --- |
| 1 | Le modèle | **B, « La colonne »** : une colonne teintée à gauche porte le numéro et les informations pratiques, le parcours occupe la droite |
| 2 | La couleur | **Couleur HERACLES** — la même sur tous les CV, quel que soit le type de recherche |
| 3 | L'écriture du numéro | **« N° 904 »** |
| 4 | Le contact en bas de page | **Une adresse générique de la commission**, réglable dans Paramètres › Mise en page ; aucun nom de personne |
| 5 | La relecture | **Validation par le référent du dossier** avant que le lien et le QR code ne servent le CV ; une fiche modifiée demande une nouvelle validation |
| 6 | Les CV déjà déposés | **Le CV produit sert dès sa validation** ; d'ici là, le fichier de Bubble ou déposé à la main reste servi |
| 7 | Le calendrier | **Tout de suite, dans le lot 5** — le lot glisse d'environ trois jours, la mise en ligne du 21 novembre et la bascule du 5 décembre ne bougent pas |
| — | L'écran de validation | **Un bandeau sous les cartes** de l'onglet *Documents* : l'état, « Voir le CV anonyme », « Valider » / « Retirer la validation » (référent seulement) |

## Ce qui en est construit

- Mise en page : `apps/web/src/lib/documents/cv-anonyme.ts` (pdfmake, Poppins
  et Roboto, comme les autres documents de la commission).
- Base : migration `0073_cv_anonyme_produit.sql`.
- Mode d'emploi : `docs/mise-en-page.md`, « Le CV anonyme produit par
  HERACLES ».

## Ce qui diffère de la maquette

- Le permis ne s'imprime que s'il est là : un CV ne dit pas ce que la personne
  n'a pas.
- La ligne de contact n'apparaît qu'une fois l'adresse réglée.
- La date du pied est celle de la validation (« CV à jour au … »).
