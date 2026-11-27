# Les offres saisies à la main

Sur l'écran **« Offres externes »** (famille « Emploi », adresse
`/espace/france-travail`), un référent ou l'administration saisit une offre
d'emploi, de stage ou de stage en alternance trouvée ailleurs qu'à France
Travail : une annonce, une entreprise du réseau, un appel. Elle rejoint la
liste des offres en cours, et la page des candidats de son secteur.

Décisions du 27 novembre 2026, posées une par une :
`docs/maquettes/saisie-d-une-offre-propositions-notes.md`. Base : migration
`0114_offres_saisies.sql`.

## Ce que voit la personne

| Où | Quoi |
| --- | --- |
| En tête de la liste « Offres d'emploi en cours » | **« + Saisir une offre »**, qui ouvre la fenêtre de saisie — flottante, non modale, une colonne |
| Dans la liste | l'offre, à sa date, avec **l'étiquette de son type** avant la date : Emploi (bleu), Stage (vert), Alternance (rouge) — les couleurs des familles de recherche |
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

## L'écran « Offres externes »

Il s'appelait « France Travail » du 23 au 27 novembre 2026, son logo pour
titre ; il reprend son nom et un titre écrit, puisque toutes ses offres ne
viennent plus de France Travail. L'adresse ne change pas : les liens déjà
donnés restent valables. Le logo (`public/logo-france-travail.svg`) a été
retiré du dépôt ; il reste dans l'historique.

## Les tests

- Base : `supabase/tests/0114_offres_saisies.test.sql` — droits de chacun,
  contrôle des champs, liste et filtres, page du candidat, purge, échues.
- Application : `apps/web/tests/offres-saisies.test.ts`, `offres.test.ts`,
  `navigation.test.ts`, `aide.test.ts` (parcours « Saisir une offre »).
