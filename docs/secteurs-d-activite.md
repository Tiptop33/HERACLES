# Les secteurs d'activité

Une seule façon de ranger les activités, partagée par les **candidats**, les
**73 loges du réseau** et les **offres**, pour pouvoir les rapprocher : un candidat
qui cherche dans le bâtiment trouve les loges du réseau qui y comptent des membres,
puis les offres du bâtiment.

> **Les loges du réseau ne sont pas les loges de HERACLES.** Les « loges » de
> l'application sont les 3 loges auxquelles se rattachent référents, candidats et
> documents (les `loges_referents` de Bubble). Les **73 loges du réseau** sont
> extérieures à l'application : leur Secrétaire n'a pas de compte HERACLES. Les
> décisions 10, 15 et 16 du 12 novembre reposaient sur une confusion entre les
> deux ; celles du 13 novembre les remplacent.

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
| 10 | Qui tient la liste d'une loge ? | ~~Le Secrétaire, connecté à HERACLES~~ — **remplacée par la décision 18** |
| 11 | Jusqu'où une loge précise-t-elle ? | **Au moins la division, puis aussi fin qu'elle le veut**, jusqu'à la sous-classe (« 43.21A ») — confirmé |
| 12 | Le formulaire de candidature, tel que maquetté ? | **Validé tel quel** |
| 13 | Où le référent modifie-t-il les secteurs d'un candidat ? | **Directement dans la fiche**, chaque geste enregistré aussitôt |
| 14 | La ligne « Repris de Bubble : « … » » ? | **Affichée tant que le référent n'a pas confirmé** les secteurs, puis retirée |
| 15 | Où la loge coche-t-elle ses secteurs ? | ~~Sur la page Référents~~ — **remplacée par les décisions 18 et 25** |
| 16 | Comment interroger chaque loge ? | ~~Un bandeau, pas de courriel~~ — **remplacée par les décisions 18 à 24** |

## Les décisions du 13 novembre 2026 — les loges du réseau

| # | Question | Décision |
| --- | --- | --- |
| 17 | D'où vient la liste des 73 loges ? | **D'ailleurs que Bubble**, et elle **n'existe pas encore** : elle est à constituer |
| 18 | Comment le Secrétaire d'une loge du réseau coche-t-il ? | Sur **sa page à part, unique** : un formulaire ouvert par un lien personnel, **sans compte HERACLES** |
| 19 | Qui constitue la liste ? | **L'administration la saisit dans HERACLES**, loge par loge |
| 20 | Que saisit-on pour chaque loge ? | Le **nom**, le **numéro**, la **province**, le **nom du Secrétaire** et son **adresse électronique** |
| 21 | Comment les nommer ? | Les « **loges du réseau** ». « Loge » garde son sens actuel |
| 22 | Combien de temps le lien vaut-il ? | **90 jours**. Le Secrétaire y revient autant qu'il veut ; l'administration peut en renvoyer un nouveau |
| 23 | Comment l'administration envoie-t-elle les liens ? | **Les deux** : un envoi groupé aux loges qui n'ont rien reçu, et un envoi loge par loge |
| 24 | Où l'administration gère-t-elle les 73 loges ? | Dans **Paramètres**, nouvelle rubrique « **Loges du réseau** » |
| 25 | Le cadre « Secteurs représentés » de la page Référents ? | **Retiré** : la page Référents reste telle qu'elle était |
| 26 | Le Secrétaire signale-t-il qu'il a terminé ? | **Non** : une loge « a répondu » dès son premier secteur coché ; l'administration voit la date de sa dernière modification |
| 27 | Le texte du courriel ? | **Réglable dans Paramètres** ; une première version est proposée |
| 28 | La page du Secrétaire, telle que maquettée ? | **Validée telle quelle** |
| 29 | La page du lien expiré ? | **Validée telle quelle** |
| 30 | Paramètres › Loges du réseau ? | **Validée telle quelle** |

Les écrans des loges du réseau sont décrits par `docs/maquettes/loges-du-reseau.html`,
et ce qui en est retenu dans `docs/maquettes/loges-du-reseau-notes.md`.

Ce qui ne change pas : la loge du réseau coche au moins la division, puis aussi
précis qu'elle le veut (décision 11), sans nom ni nombre (décision 3). Le nom et
l'adresse du Secrétaire sont des données personnelles : la liste se saisit sur le
serveur, jamais dans le dépôt, et le registre RGPD les mentionne.

Les écrans sont décrits par la maquette validée : `docs/maquettes/secteurs-d-activite.html`,
et ce qui en est retenu dans `docs/maquettes/secteurs-d-activite-notes.md`.

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
| 2 | ~~Maquettes des trois écrans~~ — **validées le 12 novembre** | fait |
| 2 bis | Construire les trois écrans, avec leurs droits d'accès. **Fait : le bloc « Secteurs représentés » de la page Référents** (migration 0091). Restent le formulaire de candidature et la fiche candidat | avant la bascule |
| 2 ter | Le bandeau du Secrétaire et le suivi des 73 loges — emplacement à montrer d'abord | avant la bascule |
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
