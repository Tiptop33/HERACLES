# HERACLES

Mise en relation de personnes en recherche — **emploi, alternance, stage** — avec des
**référents** qui les accompagnent dans leurs démarches et les conseillent.

Projet **indépendant** : aucun code, aucune base de données, aucun conteneur et aucun domaine
en commun avec EKOPLAN / MyCollabus.

## Stack

Supabase auto-hébergé en Docker (PostgreSQL, auth, API, stockage) + application web Next.js,
derrière Nginx en HTTPS sur un VPS.

## Démarrer en local

Il faut Docker et Node 22.

```bash
cp .env.example .env          # puis renseigner les clés affichées à l'étape suivante
npx supabase start            # monte la pile et joue les migrations de supabase/migrations
cd apps/web && npm install && npm run dev
```

- Application : http://localhost:3002
- Studio Supabase : http://localhost:54333
- Emails de test : http://localhost:54334 (rien ne part vraiment)

`npx supabase start` affiche l'`API URL` et l'`anon key` : ce sont les valeurs à recopier dans
`.env` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).

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
