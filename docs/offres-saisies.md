# Les offres saisies à la main

Sur l'écran **« Offres internes »** (famille « Emploi », adresse
`/espace/offres-internes`), un référent ou l'administration saisit une offre
d'emploi, de stage ou de stage en alternance trouvée ailleurs qu'à France
Travail : une annonce, une entreprise du réseau, un appel. Elle s'affiche sur
cet écran, à l'accueil, et sur la page des candidats de son secteur. L'écran
**« France Travail »**, lui, ne montre que les offres de France Travail.

Décisions du 27 novembre 2026, posées une par une :
`docs/maquettes/saisie-d-une-offre-propositions-notes.md`. Base : migrations
`0114_offres_saisies.sql` et `0115_offres_internes.sql`.

## Ce que voit la personne

| Où | Quoi |
| --- | --- |
| L'écran « Offres internes » | le titre, puis une **liste simple** — ni recherche ni filtre : elles sont peu nombreuses |
| En tête de la liste « Offres d'emploi en cours » | **« + Saisir une offre »**, qui ouvre la fenêtre de saisie — flottante, non modale, une colonne |
| Dans la liste | les offres saisies en ligne, de tous les référents, avec **l'étiquette de leur type** avant la date : Emploi (bleu), Stage (vert), Alternance (rouge) — les couleurs des familles de recherche. La même étiquette les distingue dans la liste de l'accueil |
| Dans son détail | le type et le contrat (« Emploi — CDD »), la durée, le secteur, la description, le contact, et **« Voir l'annonce »** si un lien est donné |
| Au pied du détail, pour son auteur et l'administration | « En ligne jusqu'au … », **Modifier**, **Prolonger de 30 jours**, **Retirer l'offre** (avec confirmation, sur place) |
| Sous la liste | **« Offres saisies sorties de la liste »**, seulement s'il y en a : les siennes pour un référent, toutes pour l'administration |
| Sur la page du candidat | l'offre, avec son étiquette, si elle tombe dans ses secteurs et ses départements |

## La fiche

| Champ | | Règle |
| --- | --- | --- |
| Type d'offre | requis | emploi, stage, alternance |
| Intitulé du poste | requis | 200 caractères |
| Entreprise | requis | 200 caractères |
| Code postal, ville | requis | cinq chiffres ; le département s'en déduit, comme pour France Travail |
| Contrat | facultatif | CDI, CDD, Intérim — pour un emploi seulement |
| Durée | facultatif | 60 caractères ; montrée pour un stage, une alternance, un CDD, un intérim ; oubliée pour un CDI |
| Secteur d'activité | **requis** | une section (« F ») ou une division (« 43 »), avec le choix de secteur de la fiche candidat : la page des candidats trie les offres par secteur |
| Description | facultatif | 10 000 caractères |
| Lien de l'annonce | facultatif | `http://` ou `https://` seulement |
| Contact | facultatif | 300 caractères ; **donnée personnelle d'un tiers**, visible des référents et des candidats (registre, § 4 ter) |

La fiche est contrôlée trois fois : dans la fenêtre (`FicheDOffre`,
`apps/web/src/lib/offres-saisies.ts`), dans la route, puis en base
(`offre_saisie_controlee`). Modifier remplace **toute** la fiche : un champ
vidé s'efface.

## La durée de vie

- Une offre saisie est **en cours trente jours** à compter de sa publication
  — la même règle que pour France Travail (`date_actualisation`).
- **Prolonger** remet ces trente jours à compter d'aujourd'hui. Modifier ne
  prolonge pas.
- Au-delà, elle **sort de la liste** sans être effacée : la purge des soixante
  jours (`purger_les_offres_anciennes`) l'épargne. Elle attend dans « Offres
  saisies sorties de la liste ».
- **Retirer** la supprime pour de bon, avec la trace de son auteur.
- ⚠️ Une offre sortie de la liste et jamais retirée reste en base sans
  limite : une durée maximale reste à fixer.

## Les droits

| Geste | Qui | Fonction |
| --- | --- | --- |
| Saisir | référent, administrateur | `saisir_une_offre(jsonb)` |
| Modifier | son auteur, l'administrateur | `modifier_une_offre(uuid, jsonb)` |
| Prolonger | son auteur, l'administrateur | `prolonger_une_offre(uuid)` |
| Retirer | son auteur, l'administrateur | `retirer_une_offre(uuid)` |
| Lire de quoi la modifier | son auteur, l'administrateur — `null` pour les autres | `offre_a_modifier(uuid)` |
| Voir les offres sorties de la liste | les siennes ; toutes pour l'administrateur | `offres_saisies_echues()` |

Tout passe par ces fonctions : **aucune policy d'écriture** n'est ouverte sur
`offre_emploi`, et une offre de France Travail ne se modifie jamais. Un compte
passé « chercheur » perd tout droit, même sur ses offres.

L'auteur vit dans une table à part, **`offre_saisie`**, fermée (RLS sans
policy, aucun droit de table) : la table des offres est lisible de toute
personne connectée, candidats compris, et le nom d'un référent n'a rien à y
faire. Le compte de l'auteur effacé, l'offre reste ; l'administration la
reprend.

## Dans la base

| Colonne de `offre_emploi` | Pour une offre saisie |
| --- | --- |
| `origine` | `saisie` (sinon `france_travail`) |
| `type_offre` | emploi, stage, alternance — vide pour France Travail, et la base l'impose |
| `intitule`, `entreprise_nom`, `description` | tels que saisis |
| `lieu_code_postal`, `lieu_libelle`, `departement` | code postal, ville, département déduit |
| `type_contrat_libelle` | CDI, CDD, Intérim — vide pour un stage ou une alternance |
| `duree_contrat` | la durée |
| `code_naf`, `secteur_libelle` | le code de la section ou de la division, son intitulé |
| `url_origine` | le lien de l'annonce |
| `contact` | la personne à joindre |
| `date_creation`, `date_actualisation` | la publication ; la dernière prolongation |

`section_naf_d_une_offre` lit désormais une section seule (« F » → « F ») : les
filtres par secteur, le menu des secteurs et la page du candidat la
comprennent. Sur la page du candidat, une offre rangée dans une section
parvient aussi au candidat qui cherche dans l'une de ses divisions.

## Les deux écrans de la famille « Emploi »

| Écran | Adresse | Ce qu'il montre | Lecture en base |
| --- | --- | --- | --- |
| **Offres internes** | `/espace/offres-internes` | les offres saisies — saisie, gestes, offres sorties de la liste | `offres_internes_en_cours()`, `offres_saisies_echues()` |
| **France Travail** | `/espace/france-travail` | les offres de France Travail seulement — recherche, départements, secteur | `offres_en_cours(…)`, `filtres_des_offres()` |

Le 27 novembre au matin, la saisie a d'abord été mise sur l'écran des offres
de France Travail ; rectifié le jour même (« offres externes, c'est plutôt
offres internes ») : migration 0115.

Ce même 27 novembre, l'écran « France Travail » avait été renommé « Offres
externes » et privé de son logo, sans que personne l'ait demandé. Le nom et le
logo en titre (`public/logo-france-travail.svg`) sont rétablis le jour même,
tels qu'ils étaient depuis le 23 novembre. L'adresse n'a jamais changé : les
liens déjà donnés restent valables.

L'accueil (les cinq dernières offres) et la page du candidat montrent
toujours les deux sortes d'offres.

## Les tests

- Base : `supabase/tests/0114_offres_saisies.test.sql` — droits de chacun,
  contrôle des champs, page du candidat, purge, échues ;
  `0115_offres_internes.test.sql` — chaque écran ne montre que les siennes.
- Application : `apps/web/tests/offres-saisies.test.ts`, `offres.test.ts`,
  `navigation.test.ts`, `aide.test.ts` (parcours « Saisir une offre »).
