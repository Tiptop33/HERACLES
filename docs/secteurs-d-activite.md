# Les secteurs d'activité

Une seule façon de ranger les activités, partagée par les **candidats**, les
**73 loges** et les **offres**, pour pouvoir les rapprocher : un candidat qui
cherche dans le bâtiment trouve les loges qui y comptent des membres, puis les
offres du bâtiment.

## Les décisions du 12 novembre 2026

| # | Question | Décision |
| --- | --- | --- |
| 1 | Ranger par métier (ROME) ou par secteur (NAF) ? | **Par secteur** : la nomenclature d'activités française de l'INSEE (NAF rév. 2) |
| 2 | Jusqu'à quel niveau ? | **Deux niveaux** : 21 sections › 88 divisions |
| 3 | Les secteurs d'une loge, ce sont ceux de qui ? | **Sans aucun nom** : la loge dit quels secteurs sont présents chez elle. Précisé le 12 novembre : elle **coche les secteurs présents**, sans nombre de membres |
| 4 | Que produit le rapprochement, et dans quel ordre ? | **D'abord les loges qui peuvent aider le candidat, ensuite les offres** de son secteur |
| 5 | Quand ? | **Le socle avant la bascule** du 5 décembre, les écrans de rapprochement en décembre |
| 6 | Combien de secteurs par candidat ? | **Jusqu'à trois, classés** : le premier est le principal |
| 7 | Les secteurs saisis dans Bubble ? | **Une table de correspondance** Bubble → NAF, validée une fois, appliquée à chaque reprise |
| 8 | Qui choisit les secteurs d'un candidat ? | **Le candidat propose** (formulaire de candidature), **le référent confirme** (fiche) |
| 9 | Comment trouver son secteur ? | **Une recherche par mot**, et deux listes successives |
| 10 | Qui tient la liste d'une loge ? | **Le Secrétaire**, les administrateurs en secours, avec la date de mise à jour |
| 11 | Jusqu'où une loge précise-t-elle ? | **Au moins la division, puis aussi fin qu'elle le veut**, jusqu'à la sous-classe (« 43.21A ») — confirmé |

Chaque loge sera **sollicitée** pour remplir sa liste (« on interrogera chaque loge »).

Choix faits en chemin, sans question :

- un candidat qui hésite peut **s'arrêter au grand secteur** (« F — Construction ») ;
- les listes des loges seront visibles des **référents et administrateurs de toutes les
  loges** — c'est nécessaire pour montrer les *autres* loges qui peuvent aider — et
  **jamais des candidats**.

## Secteur et métier : pourquoi c'est le secteur

| | Le métier | Le secteur |
| --- | --- | --- |
| Décrit | ce que fait la personne | ce que fait l'entreprise |
| Référentiel | ROME (France Travail) | NAF (INSEE) |
| Exemple | un comptable reste comptable… | …qu'il travaille dans le bâtiment (F) ou à l'hôpital (Q) |

Une loge ouvre des portes dans des **entreprises** : le secteur est l'axe qui lui
parle. Les offres France Travail portent les deux codes (`offre_emploi.rome_code`,
`offre_emploi.code_naf`).

## Ce qui est en place (étape 1, migrations 0086 à 0090)

```
code_naf            la nomenclature, ses 5 niveaux, 1 728 lignes
  code · intitule · niveau · parent → code_naf
  21 sections · 88 divisions             → ce que l'on choisit
  272 groupes · 615 classes · 732 sous-classes → servent à la recherche

candidat_secteur    jusqu'à 3 par candidat (section ou division)
  candidat_id · rang 1..3 · code · propose_par · confirme_par · confirme_le

loge_secteur        les secteurs cochés par la loge (de la division à la sous-classe)
  loge_id · code · coche_le · coche_par
  + loge.secteurs_maj_le : la date de la liste de la loge

rechercher_secteur(mot)        « boulangerie » → 10 — Industries alimentaires
rechercher_secteur(mot, true)  « installation électrique » → 43.21, 43.21A… pour la loge qui précise
```

Tout est **fermé** : RLS active, aucune policy, aucun droit pour `anon` ni
`authenticated`. Chaque écran apportera la lecture ou l'écriture dont il a
besoin, et pas plus (règle n° 1 du CLAUDE.md).

Données : les fichiers NAF rév. 2 de l'INSEE (`naf2008_liste_n1.xls` à
`naf2008_liste_n5.xls`, et `naf2008_5_niveaux.xls` pour les rattachements),
recopiés à l'identique.

## Ce qui reste

| Étape | Contenu | Quand |
| --- | --- | --- |
| 2 | Maquettes des trois écrans — formulaire de candidature, fiche candidat, bloc « Secteurs représentés » de la page Référents —, à valider avant d'y toucher | avant la bascule |
| 3 | Table de correspondance des secteurs Bubble → NAF, à valider | avant la bascule |
| 4 | Fiche candidat : « Loges qui peuvent aider » | décembre |
| 5 | Fiche candidat : « Offres de son secteur » | décembre |

## Limites connues

- **La recherche trouve des activités, pas des métiers.** « boulangerie »,
  « maçon », « plombier », « comptable » trouvent leur division ; « vendeur »,
  « secrétaire », « aide-soignant » ne trouvent rien, « électricien » trouve la
  production d'électricité mais pas l'installation électrique, et « cuisinier » mène à
  « 31 — Fabrication de meubles » (par « meubles de cuisine »). Une liste de
  synonymes (« cuisinier » → « 56 — Restauration ») corrigerait ces cas.
- **Les offres d'intérim** portent le code de l'agence (`78.20Z`), pas celui de
  l'entreprise où l'on travaillera. À traiter avec l'écran des offres.
- **La NAF 2025** réutilise des codes de la rév. 2 avec un autre sens.
  L'adopter demandera une colonne de version, ou une seconde table.
