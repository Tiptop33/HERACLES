# HERACLES

Mise en relation de personnes en recherche — **emploi, alternance, stage** — avec des
**référents** qui les accompagnent dans leurs démarches et les conseillent.

Projet **indépendant** : aucun code, aucune base de données, aucun conteneur et aucun domaine
en commun avec EKOPLAN / MyCollabus.

## Stack

Supabase auto-hébergé en Docker (PostgreSQL, auth, API, stockage) + application web Next.js,
derrière Nginx en HTTPS sur un VPS.

## Ports réservés (isolation stricte)

| Service | Port |
| --- | --- |
| Application web | `3002` |
| API Supabase (Kong) | `8100` |
| PostgreSQL | `5443` |
| Mailpit (local) | `8027` / `1027` |

Ces ports, le nom de la stack Docker (`heracles-prod`), le préfixe des conteneurs
(`heracles-`) et la base (`heracles`) sont **distincts de ceux de MyCollabus**. Ne jamais
réutiliser un volume, un port ou un identifiant d'un autre projet.

## Démarrer en local

À compléter au lot 1 (infrastructure Docker).

## Documentation

- Cadrage : [`docs/specs/2026-08-04-heracles-cadrage.md`](docs/specs/2026-08-04-heracles-cadrage.md)
