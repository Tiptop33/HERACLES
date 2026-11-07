# HERACLES — l'espace candidat et le bouton « Nouveau candidat »

- **Date :** 2026-11-07
- **Statut :** à valider
- **S'appuie sur :** la migration 0057 (un nouveau candidat présenté par son parrain, #72),
  les invitations des migrations 0009 et 0010, envoyées par Supabase (`inviteUserByEmail`).

## 1. Ce qu'on veut

Aujourd'hui, un candidat complète sa fiche **une seule fois**, par un lien à jeton, sans
compte. Il ne peut plus y revenir, et il saisit tout à la main alors que son CV dit déjà
l'essentiel.

On veut :

1. qu'un **administrateur** puisse ouvrir un dossier en ne saisissant que l'e-mail du candidat
   et l'identité de son parrain ;
2. que le candidat reçoive un e-mail, **choisisse son mot de passe**, et retrouve ensuite son
   **espace candidat** avec son e-mail et ce mot de passe ;
3. que la première chose demandée dans cet espace soit **son CV en PDF**. HERACLES le lit et
   **pré-remplit la fiche**, que le candidat vérifie, corrige et enregistre ;
4. que la fiche **reste modifiable** par le candidat, autant de fois qu'il le veut.

## 2. Les décisions prises (7 novembre 2026)

| Question | Décision |
| --- | --- |
| Ce bouton remplace-t-il le parcours par le parrain (0057) ? | **Non, il s'y ajoute.** Le référent garde l'invitation du parrain ; l'admin a en plus l'ouverture directe. |
| Comment lire le CV ? | **Avec Claude** (API Anthropic). Le consentement du candidat le mentionne. |
| Comment le candidat se connecte-t-il ? | **E-mail et mot de passe**, avec « mot de passe oublié ». |
| Dans quelle loge s'ouvre le dossier ? | **Celle que l'admin choisit** dans la fenêtre. Le n° de loge du parrain n'est qu'une information sur le parrain. |

## 3. Le parcours

```
Admin                         HERACLES                          Candidat
─────                         ────────                          ────────
Tableau de bord Admin
 └ « Nouveau candidat »
    fenêtre : e-mail candidat,
    parrain (nom, prénom,
    n° de loge, e-mail),
    loge du dossier
                     ──────▶  ouvre le dossier (numéro suivant,
                              loge choisie, sans référent,
                              « nouvelle demande »)
                              crée l'invitation, envoie l'e-mail ──▶  clique le lien
                                                                      choisit son mot de passe
                                                                      ─▶ espace candidat
                                                                      1. dépose son CV (PDF)
                              lit le CV avec Claude ◀──────────────
                              propose les valeurs  ──────────────▶  2. vérifie la fiche
                                                                       pré-remplie, corrige,
                                                                       enregistre
                              « candidature complétée »
Poste de travail : un référent de la loge prend le dossier en charge (comme en 0057)
```

Plus tard, le candidat se reconnecte par `/connexion` et revient sur sa fiche.

## 4. Les écrans

Les écrans ci-dessous ont été demandés. Tout ce qui viendrait en plus (un libellé, un ordre,
un élément ajouté) se demande avant d'être fait, comme le veut `CLAUDE.md`.

### 4.1 Tableau de bord Admin — le bouton « Nouveau candidat »

Sur `/espace/admin`, un bouton **« Nouveau candidat »** ouvre une petite fenêtre :

- **E-mail du candidat** *(obligatoire)*
- **Le parrain** : Nom, Prénom, N° de loge, E-mail *(les quatre obligatoires)*
- **Loge du dossier** : liste des loges *(obligatoire)*
- Boutons « Annuler » et « Envoyer l'invitation »

Après l'envoi, la fenêtre se ferme et un message confirme que le dossier n° N est ouvert. Le
courriel part par Supabase, comme toute invitation de l'écran d'administration : le lien n'est
jamais montré à l'administrateur. Si l'envoi échoue, l'invitation est révoquée et le dossier
reste ouvert ; réinviter la même adresse le reprend.

**Fenêtre rendue par le serveur à partir de l'adresse** (`?nouveau=1`), comme la fenêtre de
retrait des réunions : elle s'ouvre sans script, et le bouton « retour » la referme.

À trancher à l'écran : l'emplacement exact du bouton sur la page (proposé : en tête, à côté
du titre).

### 4.2 Activer son compte — `/invitation/[jeton]`

On reprend l'écran d'invitation existant (0009) : le candidat choisit son mot de passe et coche
les CGU. Pour lui, l'écran ne nomme **ni la loge ni le rôle** : le parrain dit s'il connaît son
appartenance (0057), et cet écran n'a pas à la lui apprendre. Le prénom et le nom qu'il y donne
commencent sa fiche.

Le lien du courriel Supabase expire au bout d'une heure, mais l'écran ne dépend que de notre
jeton, valable trente jours : un candidat qui clique plus tard active quand même son compte.

Le consentement à la lecture du CV par Anthropic viendra avec l'étape 6.

### 4.3 L'espace candidat — `/espace/candidat`

L'écran actuel `/espace/chercheur` est remplacé par `/espace/candidat` (voir § 7, vocabulaire).

**Tant qu'aucun CV n'est déposé**, l'écran ne montre qu'une chose : déposer son CV en PDF,
avec le rappel que HERACLES va le lire pour pré-remplir la fiche, et un lien discret
« remplir ma fiche sans CV ».

**Une fois le CV lu**, l'écran montre la fiche, avec les champs du formulaire de candidature
de 0057 (identité, adresse, recherche, parcours, permis, lettre de motivation) pré-remplis.
Un bandeau dit : « Ces informations viennent de votre CV. Vérifiez-les avant d'enregistrer. »

**Les visites suivantes** ouvrent directement la fiche enregistrée. Le candidat peut la
modifier, et remplacer son CV.

## 5. La lecture du CV

### 5.1 Le chemin

1. `POST /api/ma-fiche/cv`. Vérifications : session ouverte, rôle `candidat`, fiche liée au
   compte. Le fichier doit être un PDF (les premiers octets valent `%PDF`) et peser au plus
   10 Mo.
2. Le PDF est rangé dans le seau **privé** (`cv_chemin`), jamais servi par une adresse, comme
   les autres fichiers (`lib/fichiers.ts`).
3. Le PDF est envoyé à l'API Anthropic sous forme de bloc `document`, avec un outil dont le
   schéma est **exactement** la liste des champs de la fiche. Claude ne peut rien rendre
   d'autre.
4. La réponse est validée par `zod` (types, longueurs, listes de choix : `type_emploi`,
   `situation_familiale`…). Une valeur hors liste est abandonnée plutôt que corrigée.
5. Les valeurs sont **renvoyées à l'écran, pas enregistrées**. Rien n'entre en base tant que
   le candidat n'a pas cliqué « Enregistrer ».

### 5.2 Les règles

- **Ne jamais écraser ce que le candidat a saisi.** Quand il remplace son CV, la lecture ne
  remplit que les champs vides. Les autres gardent sa saisie.
- **Rien dans les journaux.** Ni le contenu du CV, ni la réponse de Claude. Seuls l'identifiant
  du dossier, la durée et le succès ou l'échec sont journalisés.
- **Clé facultative.** Si `ANTHROPIC_API_KEY` est vide, le CV est enregistré mais pas lu, et
  la fiche s'ouvre vide. Même règle que Brevo en 0057.
- **Échec silencieux pour le candidat.** Un CV scanné (une image sans texte) ou une API
  indisponible donnent une fiche vide et le message « Nous n'avons pas pu lire votre CV,
  remplissez la fiche à la main ». Jamais d'erreur technique à l'écran.
- **Modèle :** `claude-sonnet-5-5` par défaut, réglable par `ANTHROPIC_MODELE`.

### 5.3 Le consentement

La case de consentement de l'activation (§ 4.2) dit, en clair, que le CV est transmis à
Anthropic pour être lu, et qu'il n'est pas conservé par ce service au-delà du traitement.
**Le texte exact est à valider par l'association**, ainsi que la politique de conservation
d'Anthropic applicable au compte utilisé. Sans ce consentement, le CV est enregistré mais pas
lu.

## 6. La base

Migration **0060_espace_candidat.sql** et son test **0060_espace_candidat.test.sql**.

| Ce qui change | Pourquoi |
| --- | --- |
| `candidat` : `parrain_nom`, `parrain_prenom`, `parrain_loge` — mêmes noms que dans `parrainage` (`parrain_email` existe déjà) | Le parrain saisi par l'admin n'a pas forcément de fiche `referent` : on garde son identité sur le dossier. |
| `invitation` : `candidat_id` (nullable) | L'invitation d'un candidat sait quel dossier elle ouvre. |
| `inviter_un_candidat(emetteur, adresse, loge_choisie, parrain jsonb, empreinte)` | Réservée aux `admin`. Ouvre le dossier (numéro suivant, loge choisie, sans référent, nouvelle demande) et crée l'invitation au rôle `candidat`, valable 30 jours, d'un seul geste. Réinviter une adresse qui n'a pas encore accepté reprend le même dossier ; une adresse qui a déjà un dossier sans invitation est refusée. |
| `accepter_invitation` : lier `candidat.profil_id` au compte créé | Le compte retrouve son dossier. |
| `ma_fiche()` | Rend la fiche **du compte connecté**, et elle seule : `where profil_id = auth.uid()`. |
| `modifier_ma_fiche(jsonb)` | `security definer`, avec une **liste blanche** de colonnes. Le candidat ne touche ni à `referent_id`, ni à `loge_id`, ni à `appreciation`, `urgence`, `etat`, `cloture`, `archive`, ni aux champs du parrain. |
| `ranger_mon_document(genre, chemin)` | Rattache le CV (PDF seulement) ou la lettre déposés par la route, sous le chemin du dossier du candidat et aucun autre. |

Pas de policy `update` directe sur `candidat` pour ce rôle : la liste blanche tient dans la
fonction, comme `completer_sa_candidature` en 0057.

**Les tests** jouent le candidat (`set local role authenticated`, son `sub`) et vérifient :
qu'il lit sa fiche et aucune autre ; qu'il modifie les champs permis et pas les autres ; qu'un
référent ou un anonyme n'appelle pas `inviter_un_candidat` ; qu'une invitation ne sert qu'une
fois.

## 7. Le vocabulaire : `chercheur` devient `candidat`

Le lot 1 a laissé le rôle `chercheur` dans l'énumération `role_utilisateur`, et l'écran
`/espace/chercheur`. `CLAUDE.md` l'interdit. Puisque ce chantier donne enfin un usage à ce
rôle, on le renomme : `alter type public.role_utilisateur rename value 'chercheur' to
'candidat'`, et `/espace/chercheur` devient `/espace/candidat`. Toutes les références du code
sont reprises dans la même étape.

## 8. Ce qui n'est pas dans ce chantier

- La messagerie entre candidat et référent.
- La lecture d'un CV scanné (reconnaissance de caractères).
- Le CV anonyme produit automatiquement.
- Le transfert des fiches PARRAIN de Bubble vers les nouveaux champs du parrain.

## 9. Les étapes

Un commit par étape, chacun passant `executer.sh`, puis `lint`, `test` et `build`.

1. **Vocabulaire** : `chercheur` → `candidat` (migration 0059, routes, code).
2. **Base** : migration 0060 et ses tests.
3. **Admin** : le bouton, la fenêtre, la route `POST /api/candidats/inviter`, l'e-mail d'invitation de Supabase.
4. **Activation** : l'écran d'invitation pour le rôle `candidat`, avec le consentement.
5. **Espace candidat** : le dépôt du CV, la fiche, `ma_fiche()` et `modifier_ma_fiche()`.
6. **Lecture du CV** : la route, l'appel à Claude, la validation, le pré-remplissage.

## 10. Le calendrier

Le lot 5 (la loge et l'administration) se termine le **14 novembre**, et la mise en ligne est
prévue le **21 novembre**. Les étapes 1 à 5 suffisent pour la bascule : un candidat peut
ouvrir son compte et remplir sa fiche à la main. L'étape 6, la lecture du CV, peut arriver
pendant les deux semaines de vérification, sans retarder la bascule du **5 décembre**. Si elle
n'est pas prête, la fiche reste simplement vide à la première visite.

## 11. Points ouverts

1. Le texte du consentement (§ 5.3), à valider par l'association.
2. L'emplacement du bouton « Nouveau candidat » sur le tableau de bord Admin (§ 4.1).
3. Le lien « remplir ma fiche sans CV » (§ 4.3) : à garder, ou CV obligatoire ?
