# Guide — refaire sur Supabase les tables de Bubble

Pas à pas, de zéro jusqu'aux données reprises. Compter une heure la première fois.

À la fin, tu auras sur ta machine une base Supabase contenant les mêmes tables que ton
application Bubble, remplies avec les mêmes données.

---

## Étape 0 — Ce qu'il faut avoir

| | Vérifier avec | Où l'installer |
| --- | --- | --- |
| Docker | `docker --version` | docker.com — Docker Desktop |
| Node 22 ou plus | `node --version` | nodejs.org |
| Git | `git --version` | git-scm.com |

Docker doit être **démarré** : la baleine apparaît dans la barre de menus (macOS) ou dans la
barre des tâches (Windows). Sans lui, Supabase ne peut pas se lancer.

> Sur un **Mac Apple Silicon** (puce M1 à M4), prends bien la version *Apple Silicon* de Docker
> Desktop — celle pour Intel ne fonctionnera pas. Menu  → *À propos de ce Mac* pour vérifier.

## Étape 1 — Récupérer le projet

```bash
git clone https://github.com/Tiptop33/HERACLES.git
cd HERACLES
```

Si tu l'as déjà : `cd HERACLES && git pull`.

## Étape 2 — Créer les tables

Une seule commande. Elle télécharge la pile Supabase (quelques minutes la première fois),
démarre la base, **et joue toutes les migrations** — c'est-à-dire qu'elle crée les tables.

```bash
npx supabase start
```

À la fin, elle affiche un bloc de ce genre :

```
API URL: http://127.0.0.1:54331
DB URL: postgresql://postgres:postgres@127.0.0.1:54332/postgres
Studio URL: http://127.0.0.1:54333
anon key: eyJhbGciOi...
service_role key: eyJhbGciOi...
```

**Garde ce bloc sous les yeux**, on s'en sert deux fois ensuite.

> Les tables sont créées à partir des fichiers `supabase/migrations/`. Il n'y a rien à cliquer
> et rien à recopier à la main : c'est le dépôt qui fait foi.

## Étape 3 — Vérifier que les tables sont là

Ouvre **http://127.0.0.1:54333** (le Studio), rubrique *Table Editor*. Tu dois voir neuf
tables :

`candidat` · `referent` · `loge` · `loge_membre` · `entreprise` · `offre_emploi` ·
`document` · `parametre` · `profil`

Elles sont vides — c'est normal, on les remplit à l'étape 5.

Contrôle plus sûr, en une commande :

```bash
PGHOST=127.0.0.1 PGPORT=54332 PGUSER=postgres PGPASSWORD=postgres ./supabase/tests/executer.sh
```

Tout doit finir par « Tout est passé ». Ce script crée sa propre base de test, la contrôle,
puis la supprime : il ne touche pas à tes données.

## Étape 4 — Préparer Bubble

Il faut deux choses côté Bubble : que l'API donne accès aux données, et un jeton pour que ce
soit **toi seul** qui y accèdes.

1. **Créer un jeton.** `Settings → API → API Tokens → Generate a new API token`. Copie-le, il
   ne s'affiche qu'une fois.
2. **Exposer les types.** `Settings → API` → coche *Enable Data API*, puis coche **tous** les
   types de données. Sans ça, l'API ne les voit pas.
3. **Fermer au public.** `Data → Privacy` → pour chaque type, retire les droits de
   « everyone else ». Un appel avec ton jeton passe outre ces règles ; un curieux sans jeton,
   non.

> ⚠️ Aujourd'hui, cette API répond **sans jeton** : n'importe qui peut lire les 107 fiches
> candidats. Le point 3 corrige cela — fais-le même si tu ne reprends pas les données tout de
> suite.

## Étape 5 — Reprendre les données

```bash
cd outils
npm install
```

Puis, en remplaçant `TON-JETON`. **Sur macOS ou Linux** :

```bash
export BUBBLE_TOKEN="TON-JETON"
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54332/postgres"
LIMITE=5 node import-bubble.mjs     # essai sur cinq enregistrements par table
```

Puis, pour tout reprendre — et effacer le jeton en fin de séance :

```bash
node import-bubble.mjs
unset BUBBLE_TOKEN
```

**Sous Windows (PowerShell)**, attention : la syntaxe `VAR=valeur commande` ci-dessus **ne fait
rien** — les variables doivent être posées avant, et effacées autrement :

```powershell
$env:BUBBLE_TOKEN = "TON-JETON"
$env:DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54332/postgres"
$env:LIMITE = "5"
node import-bubble.mjs
Remove-Item Env:LIMITE, Env:BUBBLE_TOKEN
```

Le script affiche ce qu'il fait :

```
loges_referents → loge : 3 repris
user → referent : 71 repris
candidats → candidat : 107 repris
...
Rattachements :
  candidat.referent_id : 85 résolus — 2 sans correspondance
```

Il est **rejouable** : relancé, il met à jour les fiches déjà reprises au lieu d'en créer des
doubles. En cas de doute, relance-le.

## Étape 6 — Contrôler

Dans le Studio, ouvre `candidat` : tu dois retrouver tes 107 fiches, et la colonne
`referent_id` renseignée. Ou en ligne de commande :

```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54332 -U postgres -c \
  "select (select count(*) from candidat) as candidats,
          (select count(*) from referent) as referents,
          (select count(*) from offre_emploi) as offres"
```

**« sans correspondance »** dans le rapport n'est pas une erreur : cela veut dire qu'une fiche
pointe vers quelqu'un qui n'existe plus dans Bubble. Le lien est laissé vide, la fiche est
gardée.

## Étape 7 — Refermer Bubble

Une fois la reprise faite, retourne dans `Settings → API` et **décoche les types** que tu avais
exposés. Vérifie ensuite que cette adresse ne répond plus rien d'utile :

```
https://heracles-42268.bubbleapps.io/api/1.1/obj/candidats
```

---

## Ce que la reprise ne fait pas

**Les fichiers restent chez Bubble.** CV, photos, lettres et PDF sont hébergés sur le CDN de
Bubble (`//xxx.cdn.bubble.io/…`). Les tables gardent leurs adresses, mais ces adresses
cesseront de répondre le jour où l'application Bubble sera fermée. Les rapatrier dans Supabase
Storage est une étape à part, à faire avant la bascule du 5 décembre.

**Les téléphones ont déjà perdu leurs zéros.** Bubble les stockait comme des nombres :
`0033765730385` y est devenu `33765730385`. La reprise les met en texte — ce qui empêche que
ça recommence — mais ne peut pas restaurer ce qui a été perdu avant elle.

**Dix types de données manquent encore** dans la base *en service*. `PROVINCE`, `LOGES`,
secteurs d'activité, métiers, codes NAF… sont référencés par des champs mais ne sont pas
exposés par son API. Leurs identifiants sont conservés (colonnes `..._bubble_id`) : quand tu les
auras exposés à l'étape 4, dis-le moi et j'ajoute les tables correspondantes.

La base de **l'éditeur**, elle, les expose — c'est pourquoi le script les reprend là, en JSON,
dans la table `bubble_brut`. Les identifiants étant communs aux deux bases, ce qui vient de
l'éditeur se rattache aux vraies fiches. Les **tâches** ont fait ce chemin-là : 467 lignes de
suivi, reprises en brut puis dépliées dans le journal des candidats par la migration 0023.

---

## Si ça coince

| Message | Ce qu'il faut faire |
| --- | --- |
| `Cannot connect to the Docker daemon` | Docker n'est pas démarré. Lance Docker Desktop. |
| `port is already allocated` | Un autre projet occupe un port. Les nôtres sont 54331-54334 et 3002 ; vérifie qu'aucune autre pile Supabase ne tourne. |
| `HTTP 401` ou `403` à l'import | Jeton absent, mal copié, ou type non exposé (étape 4). |
| `HTTP 400 invalid appname` | Le nom de l'application est faux. Il se lit dans l'URL de l'éditeur Bubble. |
| `DATABASE_URL manquante` | Sous PowerShell, la ligne `$env:DATABASE_URL = "…"` n'a pas été validée : recolle-la seule, puis Entrée. Sous macOS/Linux, les trois lignes forment **une seule** commande — garde les `\` en fin de ligne. |
| `ECONNREFUSED` à l'import | Supabase est arrêté. Reviens dans le dossier `HERACLES` et refais `npx supabase start`. |
| `relation "candidat" does not exist` | Les migrations n'ont pas tourné. Reprends l'étape 2. |
