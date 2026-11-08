# Un nouveau candidat : le parcours du parrainage

Repris de l'application Bubble, en trois temps. Migration `0057_nouveau_candidat.sql`.

| Temps | Qui | Où | Ce qui se passe |
| --- | --- | --- | --- |
| 1 | un référent | *Candidats → Nouveau candidat* | il saisit l'adresse du parrain ; HERACLES lui envoie un lien |
| 2 | le parrain, sans compte | `/parrainage/<jeton>` | il se présente, présente le candidat (lien, appartenance, se dévoiler, urgence 0-5) ; le dossier s'ouvre dans la loge du référent, avec le numéro suivant, **sans référent** ; le candidat reçoit son lien |
| 3 | le candidat, sans compte | `/candidature/<jeton>` | il complète sa fiche et joint son CV (obligatoire) et sa lettre (facultative) |
| 4 | un référent de la loge | la fiche, onglet *Profil* | **Prendre en charge**, pour soi ou pour un collègue de la loge |

**Pas de relance automatique.** Bubble relançait le parrain sans réponse après
24 heures (workflow `EnvoyerEmailRappel`), et HERACLES sait le faire — mais la décision
du 8 novembre 2026 est de ne pas la mettre en service : les référents relancent
eux-mêmes. Voir « La relance — désactivée », plus bas.

## Les règles qui comptent

- **Les jetons** : 32 octets tirés au sort, valables 30 jours, servis une seule fois. La
  base n'en garde que l'empreinte sha256. Une relance ajoute un second lien sans
  invalider le premier.
- **La loge et le numéro** sont fixés par la base, jamais par le formulaire : la loge
  du référent qui a invité, et le plus grand numéro déjà donné dans cette loge, plus
  un. La ligne de la loge est verrouillée pendant le calcul.
- **Le parrain déjà dans HERACLES** — même adresse que celle à laquelle il a reçu le
  lien — devient parrain du dossier au sens de la RLS : il le lit et le corrige.
- **Prendre en charge** : un référent de la loge, tant que personne n'accompagne le
  candidat ; ou son référent, qui le passe à un collègue. On ne retire pas un candidat
  à quelqu'un d'autre : cela se décide en commission.
- **Les fichiers** : leur format se lit dans leurs octets (PDF, DOC, DOCX, ODT, RTF,
  JPEG, PNG, WebP), 10 Mo au plus, rangés dans le seau privé `documents` sous
  `candidat/cv/<id>.<ext>` et `candidat/lettre/<id>.<ext>`. La base refuse tout autre
  chemin.
- **Le lien du candidat perdu** : *Nouveau candidat → Renvoyer au candidat* en envoie
  un nouveau, et l'ancien cesse de valoir.

## Configuration

Dans le `.env` de la pile (voir `.env.example`) :

| Variable | Rôle |
| --- | --- |
| `BREVO_API_KEY` | la clé de l'API transactionnelle de Brevo |
| `COURRIEL_EXPEDITEUR` | l'adresse d'envoi, **déclarée chez Brevo** |
| `COURRIEL_NOM_EXPEDITEUR` | le nom par défaut ; chaque courriel porte celui de la loge |
| `RELANCE_SECRET` | **à laisser vide** : la relance est désactivée, et la route `/api/relances` répond alors `401` à tout le monde |
| `NEXT_PUBLIC_APP_URL` | déjà là : c'est elle qui fait l'adresse des liens |

Le paramétrage de Brevo lui-même — domaine, clés, adresse IP du serveur —
est dans `docs/brevo.md`.

**Sans Brevo**, rien ne part : l'invitation est enregistrée quand même, et le lien
s'affiche au référent pour qu'il le transmette. C'est le mode d'essai.

**Sur l'instance d'essai**, ces variables vont dans `/opt/heracles-essai-depot/.env.essai`,
ajoutées à la main, puis `sudo /opt/heracles-essai-depot/infra/essai/mettre-a-jour.sh`.
`deployer.sh` réécrit ce fichier mais conserve `BREVO_API_KEY`, `COURRIEL_EXPEDITEUR`,
`COURRIEL_NOM_EXPEDITEUR` et `RELANCE_SECRET` ; `mettre-a-jour.sh` ne fait que le lire.

Si rien n'arrive, `docker logs heracles-essai-web-web-1 2>&1 | grep courriel` dit pourquoi :
réglage absent, refus de Brevo (clé, ou adresse IP du serveur non autorisée), ou rien —
Brevo a accepté, et c'est dans ses journaux d'envoi qu'il faut regarder.

Les textes des courriels sont ceux de la commission, repris de Bubble dans `parametre` :
`objet_parrain` / `mot_parrain`, `objet_relance_parrain` / `mot_relance_parrain`,
`objet_candidat` / `mot_candidat`. Le lien est ajouté à la fin. Un modèle vide laisse la
place à un texte par défaut.

## La relance — désactivée

Décision du 8 novembre 2026 : pas de relance automatique, ni par n8n ni par une tâche
du VPS. Le code reste en place, inactif : sans tâche planifiée, rien ne l'appelle, et
sans `RELANCE_SECRET` la route refuse tout.

Pour la remettre en service un jour : un secret de 32 caractères au moins
(`openssl rand -hex 32`) dans `RELANCE_SECRET`, puis une tâche planifiée qui appelle
la route toutes les heures — par exemple, en cron sur le VPS :

```cron
7 * * * * curl -fsS -X POST -H "Authorization: Bearer $RELANCE_SECRET" https://<domaine>/api/relances >/dev/null
```

La réponse ne contient que des compteurs : `{"a_relancer":2,"envoyees":2,"echecs":0}`.
Sans secret configuré, la route répond `401` à tout le monde.

## Ce qui reste à faire

- **Déverser les 102 fiches PARRAIN de Bubble** — elles sont dans `bubble_brut` — vers
  les colonnes de présentation des candidats reprises (lien, appartenance, se dévoiler,
  urgence). Jusque-là, le bloc *Présentation* n'apparaît que sur les nouveaux dossiers.
- **L'écran *Modifier*** ne corrige pas encore les champs ajoutés par 0057.
- **Le secteur et le métier ROME** : le candidat dit son métier en clair, faute des
  référentiels (`SECTEUR_ACTIVITE` n'est pas exposé par l'API Bubble).
- **Le CV anonyme**, que Bubble produisait à l'envoi de la fiche.
