# Le modèle Bubble, repris dans Supabase

- **Date du relevé :** 2026-08-04
- **Source :** application Bubble `heracles-42268`, API Data (`/api/1.1/meta` puis
  `/api/1.1/obj/<type>`)
- **Résultat :** migration [`supabase/migrations/0002_modele_bubble.sql`](../../supabase/migrations/0002_modele_bubble.sql)

## Méthode

Bubble n'expose pas de description de schéma : le point `/meta` ne donne que la **liste** des
types. Les champs ont donc été déduits en lisant les enregistrements et en faisant l'union de
leurs clés — Bubble omet purement et simplement les champs vides de ses réponses, un seul
enregistrement n'aurait pas suffi.

Seuls les **noms** et les **types** de champs ont été conservés. Aucune donnée personnelle n'a
été gardée, ni recopiée dans ce dépôt.

## Ce qui a été relevé

| Type Bubble | Enregistrements | Champs | Table Supabase |
| --- | ---: | ---: | --- |
| `candidats` | 107 | 50 | `candidat` |
| `user` | 71 | 21 | `referent` |
| `loges_referents` | 3 | 12 | `loge` + `loge_membre` |
| `info_entreprise` | 1 | 10 | `entreprise` |
| `offreemploi` | 4 539 | 41 | `offre_emploi` |
| `pdfs` | 135 | 10 | `document` |
| `global` | 1 | 33 | `parametre` |

## Les conversions qui ne vont pas de soi

**Le téléphone était un nombre.** Chez Bubble, `TELEPHONE` et `IMMATRICULATION` sont numériques :
un `0033765730385` perd ses zéros de tête et ne supporte ni `+`, ni espace, ni indicatif. Ils
deviennent du texte. Idem pour le SIRET, que Bubble stockait deux fois — en texte **et** en
nombre ; une seule colonne suffit.

**Les listes de références n'entrent pas dans une colonne.** `REFERENTS_LOGES_REFERENTS` (la
liste des référents d'une loge) devient une table de liaison `loge_membre`. Les autres listes
pointent vers des types que l'API n'expose pas : elles sont gardées telles quelles, en tableau
d'identifiants Bubble (`taches_bubble_ids`, `canaux_bubble_ids`, `whatsapp_bubble_ids`), à
convertir quand on saura vers quoi elles pointent.

**Les adresses géographiques** (`ADRESSES`, `Adresse_entreprise`) sont des objets composés chez
Bubble : elles deviennent du `jsonb`, en attendant de décider quels morceaux méritent leurs
propres colonnes.

**Chaque table garde son `bubble_id`.** C'est l'identifiant d'origine ; il permettra de
reprendre les données et de résoudre les liens en deux passes — d'abord les lignes, ensuite les
rattachements.

**Un lien vers un type non exposé reste un `..._bubble_id text`.** On ne peut pas poser de clé
étrangère vers une table qui n'existe pas encore ; la valeur est conservée, la contrainte
viendra après.

## Ce qui manque encore

L'API n'expose que sept types. Or plusieurs champs pointent vers des types **absents de cette
liste** — il en existe donc d'autres dans l'application :

`PROVINCE`, `LOGES`, `SECTEUR-ACTIVITE-CAND`, `SECTEUR ACTIVITE ROME`, `metier-cand`,
`titre metier`, `Code_NAF_Candidats`, `TACHES`, `Channels`, `secteur_section`.

Il faut la liste complète des types (`Data → Data types` dans l'éditeur) pour finir le modèle.

Par ailleurs, une quinzaine de champs sont des **listes de choix** Bubble (option sets) que
l'API renvoie en simple texte : `TYPE EMPLOI`, `SITUATION FAMILIALE`, `ARCHIVER`, `CLOTURE`,
`APPRECIATION`, les trois permis, `VEHICULE`, `GRADES`, `COLLEGE`, `OFFICIERS`, `APPEL`,
`Type_doc`. Ils sont en `text` pour l'instant. Connaître leurs valeurs permettra d'en faire de
vrais référentiels — et d'empêcher les fautes de saisie.

## Ce que ce modèle change dans le cadrage

Le cadrage du 2026-08-04 avait été écrit sans connaître l'application existante. Trois de ses
décisions sont contredites par le modèle réel :

1. **Les structures existent déjà.** On avait tranché « pas d'organismes en v1 » ; or
   `loges_referents` est une table à part entière, à laquelle se rattachent référents,
   candidats et documents. Elle est reprise telle quelle.
2. **Les offres d'emploi sont au cœur du produit.** On les avait mises hors périmètre ; il y en
   a 4 539, manifestement alimentées depuis France Travail (`ft_id`, code ROME, code NAF,
   coordonnées géographiques).
3. **Il y a deux rôles d'accompagnement, pas un.** Un candidat a un `PARRAIN-candidat` **et**
   un `REFERENTS` — ce sont deux personnes distinctes, avec deux fonctions distinctes. Le
   cadrage n'en connaissait qu'une.

S'y ajoute le vocabulaire : l'application dit « candidat », « parrain », « loge », « province »,
« collège », « grade ». Nous avions retenu « chercheur ». **Le cadrage est à réviser sur ces
quatre points** — c'est une décision à prendre, pas un détail de nommage.

## Tout est fermé

Les huit tables ont la RLS activée et **aucune policy** sur les données personnelles : hors clé
`service_role`, rien n'est lisible. Chaque écran ouvrira ce dont il a besoin, et rien de plus.
Seules les offres d'emploi et les réglages sont lisibles par une personne connectée — ils ne
contiennent personne.

Ce choix est délibéré : au moment du relevé, l'API Data de l'application Bubble répondait à
tout Internet sans jeton, fiches candidats comprises.
