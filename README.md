# HERACLES

Mise en relation de personnes en recherche — **emploi, alternance, stage** — avec des
**référents** qui les accompagnent dans leurs démarches et les conseillent.

Projet **indépendant** : aucun code, aucune base de données, aucun conteneur et aucun domaine
en commun avec EKOPLAN / MyCollabus.

## Où en est le projet

**Échéance : 5 décembre 2026**, remplacement de l'application Bubble `heracles-42268`.

| Lot | État |
| --- | --- |
| 1 — Fondations : comptes, connexion, profil | ✅ |
| 2 — Reprise des données Bubble | ✅ 17 700 enregistrements, [relevé](docs/reprise-bubble-releve.md) |
| 3 — L'espace référent : liste des candidats, fiche, modification | ✅ [plan](docs/plans/2026-08-05-lot3-espace-referent.md) |
| 4 — Les offres d'emploi | 31 octobre |
| 5 — La loge et l'administration | 14 novembre |
| 6 — Mise en ligne | 21 novembre |

Les fichiers (CV, photos, PDF) sont encore hébergés chez Bubble : `outils/rapatrier-fichiers.mjs`
les rapatrie, à faire avant la bascule.

## Stack

Supabase auto-hébergé en Docker (PostgreSQL, auth, API, stockage) + application web Next.js,
derrière Nginx en HTTPS sur un VPS.

## Démarrer en local

Il faut Docker et Node 22.

```bash
npx supabase start            # monte la pile et joue les migrations de supabase/migrations
cp apps/web/.env.example apps/web/.env.local   # puis y recopier les clés affichées
cd apps/web && npm install && npm run dev
```

- Application : http://localhost:3002
- Studio Supabase : http://localhost:54333
- Emails de test : http://localhost:54334 (rien ne part vraiment)

`npx supabase start` affiche l'`API URL` et l'`anon key` : ce sont les deux valeurs à recopier
dans `apps/web/.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).

**Deux fichiers d'environnement, deux usages.** Next ne lit le sien que dans son propre dossier et
ne remonte jamais l'arborescence : le `.env` de la racine ne lui parviendrait pas.

| Fichier | Pour quoi |
| --- | --- |
| `apps/web/.env.local` | développer l'application web en local — modèle : `apps/web/.env.example` |
| `.env` (racine) | la pile de production : Docker Compose, PostgreSQL, SMTP — modèle : `.env.example` |

Si `npm run dev` s'arrête sur « *Your project's URL and Key are required to create a Supabase
client* », c'est que `apps/web/.env.local` manque ou est vide. Au démarrage, Next annonce le
fichier qu'il a chargé : `- Environments: .env.local`.

## Essayer l'espace référent

Un jeu de personnes inventées, à poser sur la base locale — jamais sur la vraie :

```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54332 -U postgres -d postgres \
  -f supabase/demo/jeu-d-essai.sql
```

Puis créez un compte sur http://localhost:3002/inscription en choisissant **« accompagner des
personnes en recherche »**, avec l'une de ces trois adresses :

| Adresse | Ce qu'elle donne à voir |
| --- | --- |
| `bernard@example.org` | la loge de Bordeaux, 5 candidats — un à contacter, un clôturé |
| `claire@example.org` | la loge de Toulouse, 2 autres candidats |
| `michel@example.org` | seulement les 2 candidats qu'il parraine, dans deux loges différentes |

L'email de confirmation arrive dans la boîte de test : http://localhost:54334. L'adresse suffit à
rattacher le compte à sa fiche de référent — c'est ce que fait la migration `0006`.

**Pour éprouver l'isolation vous-même** : connectez-vous avec Bernard, copiez l'adresse d'une de
ses fiches, déconnectez-vous, reconnectez-vous avec Claire et collez cette adresse. Vous obtenez
une page introuvable. Ce n'est pas la page qui refuse — c'est la base qui ne renvoie rien.

## Vérifier

```bash
cd apps/web
npm test          # tests unitaires (Vitest)
npm run lint      # ESLint
npm run build     # construction de production
```

Et la base — migrations et règles d'accès — dans une base jetable :

```bash
PGHOST=localhost PGPORT=54332 PGUSER=postgres ./supabase/tests/executer.sh
```

Le script joue le harnais (`supabase/tests/harnais.sql`, qui reconstitue le schéma `auth` de
Supabase), toutes les migrations, puis tous les `*.test.sql`. Il tourne aussi bien contre la
pile Supabase locale que contre un PostgreSQL nu — pratique pour éprouver la RLS sans lancer
les dix conteneurs.

## Ports réservés (isolation stricte)

| Service | Local | Production |
| --- | --- | --- |
| Application web | `3002` | `127.0.0.1:3002` |
| API Supabase (Kong) | `54331` | `127.0.0.1:8100` |
| PostgreSQL | `54332` | interne au réseau Docker |
| Studio | `54333` | — |
| Boîte mail de test | `54334` | SMTP réel |

Ces ports, le nom de la stack Docker (`heracles-prod`), le préfixe des conteneurs
(`heracles-`) et la base (`heracles`) sont **distincts de ceux de MyCollabus**. Ne jamais
réutiliser un volume, un port ou un identifiant d'un autre projet.

## Documentation

- Cadrage : [`docs/specs/2026-08-04-heracles-cadrage.md`](docs/specs/2026-08-04-heracles-cadrage.md)
- Plan du lot 1 : [`docs/plans/2026-08-04-lot1-fondations.md`](docs/plans/2026-08-04-lot1-fondations.md)
- Plan du lot 3 : [`docs/plans/2026-08-05-lot3-espace-referent.md`](docs/plans/2026-08-05-lot3-espace-referent.md)
- Maquettes : [`docs/maquettes/`](docs/maquettes/) — le dessin d'origine et ce qui en a été retenu
