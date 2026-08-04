# HERACLES — cadrage

- **Date :** 2026-08-04
- **Statut :** version 1, à valider (les points ouverts sont listés en fin de document)
- **Porteur :** architecte D.P.L.G.
- **⚠️ Projet 100 % indépendant d'EKOPLAN / MyCollabus** (aucun code, aucune base, aucun
  conteneur, aucun domaine commun).

---

## 1. À quoi sert HERACLES

HERACLES met en relation des personnes **en recherche** — emploi, alternance, stage — avec des
**référents** qui les accompagnent : conseils, relecture de candidature, préparation d'entretien,
aide dans les démarches administratives, mise en contact.

Le cœur du produit n'est pas l'offre d'emploi : c'est **la relation d'accompagnement**. Une
personne seule face à ses démarches trouve quelqu'un qui les connaît, et garde ce fil dans la
durée.

## 2. Les acteurs

| Acteur | Ce qu'il fait |
| --- | --- |
| **Chercheur** | Crée son profil, dit ce qu'il cherche (emploi / alternance / stage), consulte l'annuaire des référents, demande une mise en relation, échange, suit ses démarches. |
| **Référent** | Crée son profil (domaines, type d'aide proposée, disponibilité), reçoit les demandes, accepte ou refuse, accompagne les chercheurs qu'il suit. |
| **Administrateur** | Modère les inscriptions de référents, gère les référentiels (domaines, types de recherche), traite les signalements. |

> **Vocabulaire** — « chercheur » et « référent » sont les termes retenus dans tout le produit
> (code, base, interface). À confirmer : voir point ouvert n° 1.

## 3. Les parcours

**Chercheur**
1. Inscription (email + mot de passe, confirmation par email) → choisit « je cherche ».
2. Remplit son profil : identité, ville, situation actuelle, niveau d'études.
3. Décrit sa recherche : type (emploi / alternance / stage), domaine, métier visé, zone
   géographique, disponibilité.
4. Parcourt l'annuaire des référents, filtre par domaine et par zone.
5. Envoie une demande de mise en relation, avec un mot d'explication.
6. Une fois la demande acceptée : échange avec son référent, dépose son CV, suit ses démarches.

**Référent**
1. Inscription → choisit « j'accompagne ».
2. Remplit son profil : structure ou bénévole, domaines d'expertise, types d'accompagnement,
   nombre de personnes qu'il peut suivre.
3. Reçoit les demandes, les accepte ou les refuse (avec un motif).
4. Suit ses chercheurs : liste, échanges, points d'avancement.

## 4. Périmètre

**Dans la version 1 (lots 1 à 3)**
- Comptes et authentification, avec les deux profils chercheur / référent.
- Profils complets et modifiables, photo comprise.
- Annuaire des référents, recherche et filtres.
- Demande de mise en relation : envoi, acceptation, refus, clôture.
- Messagerie simple à l'intérieur d'une relation.
- Dépôt de documents (CV, lettre de motivation) visibles du seul référent accepté.
- Espace d'administration minimal : modération des référents, référentiels.

**Hors périmètre pour l'instant** (à rouvrir plus tard si besoin)
- Publication d'offres d'emploi et candidature en ligne.
- Appariement automatique chercheur ↔ référent (la v1 laisse le chercheur choisir).
- Visioconférence intégrée, agenda synchronisé.
- Application mobile native (le web est responsive).
- Paiement, abonnement.

## 5. Modèle de données initial

Sur Supabase : `auth.users` porte l'authentification, tout le reste vit dans `public`.

| Table | Contenu |
| --- | --- |
| `profil` | 1-1 avec `auth.users` : nom, prénom, téléphone, ville, code postal, photo, présentation, **rôle** (`chercheur` \| `referent` \| `admin`). |
| `recherche` | Ce que cherche un chercheur : type (`emploi` \| `alternance` \| `stage`), domaine, métier visé, niveau d'études, zone, disponibilité, description. Un chercheur peut en avoir plusieurs. |
| `referent_profil` | Complément du profil référent : structure, statut (bénévole / professionnel), domaines, types d'accompagnement, capacité, **validé** (modération). |
| `relation` | La mise en relation : `chercheur_id`, `referent_id`, `statut` (`en_attente` \| `acceptee` \| `refusee` \| `close`), message d'accroche, motif de refus, dates. |
| `message` | Échanges dans une relation : `relation_id`, auteur, texte, date, lu. |
| `document` | Fichiers du chercheur (CV, lettre) dans Supabase Storage : propriétaire, type, nom, chemin. |
| `domaine` | Référentiel des domaines / secteurs (seed). |

**Règles d'accès (RLS)** — toutes les tables portent `enable row level security` :
- un chercheur ne voit que ses propres données ;
- un référent ne voit un chercheur **que si une `relation` acceptée les lie** ;
- les documents suivent la même règle que la relation ;
- l'annuaire des référents n'expose que les profils `validé = true`, et seulement les champs
  publics ;
- l'administrateur passe par des routes serveur qui vérifient son rôle avant tout accès élargi.

## 6. Stack technique

Identique dans ses principes à MyCollabus — c'est éprouvé — mais **déployée séparément** :

| Brique | Choix |
| --- | --- |
| Base + auth + API + stockage | **Supabase auto-hébergé** en Docker (PostgreSQL, GoTrue, PostgREST, Storage, Kong) |
| Application web | **Next.js** (App Router, TypeScript), responsive, conteneurisée |
| Accès aux données | `@supabase/ssr` côté serveur (RLS appliquée), routes API serveur pour les cas privilégiés |
| Emails | Mailpit en local, SMTP transactionnel en production |
| Hébergement | VPS, Docker Compose, Nginx en reverse-proxy, HTTPS Let's Encrypt |
| Tests | Vitest pour la logique, vérification par déploiement pour l'infra |

## 7. Isolation vis-à-vis de MyCollabus — non négociable

Les deux projets peuvent cohabiter sur le même VPS : rien ne doit se croiser.

| | MyCollabus | **HERACLES** |
| --- | --- | --- |
| Dépôt | `Tiptop33/EKOPLAN` | `Tiptop33/HERACLES` |
| Projet Docker | `mycollabus-prod` | `heracles-prod` |
| Conteneurs Supabase | `supabase-db`, `supabase-kong`… | préfixés `heracles-` (**obligatoire** : sinon collision de noms) |
| Dossier de la stack | `/opt/supabase` | `/opt/supabase-heracles` |
| API Supabase (Kong) | `127.0.0.1:8000` | `127.0.0.1:8100` |
| PostgreSQL | `5432` / `5442` | `5443` |
| Application web | `3001` | `3002` |
| Mailpit (local) | `8026` / `1026` | `8027` / `1027` |
| Base de données | `mycollabus` | `heracles` |
| Domaine | `mycollabus.fr` | à définir (point ouvert n° 6) |
| Volumes Docker | ceux de `mycollabus-*` | jamais réutilisés |

Aucune donnée, aucun compte, aucun fichier ne transite d'un projet à l'autre.

## 8. Données personnelles

Le produit manipule des données de personnes en recherche d'emploi : identité, coordonnées,
parcours, CV. À traiter dès la conception, pas après :
- consentement explicite à l'inscription, et information claire sur ce qui est visible par qui ;
- un référent ne voit un dossier **qu'après acceptation de la relation** — jamais avant ;
- suppression du compte possible, avec effacement des documents ;
- durée de conservation à fixer (point ouvert n° 7) ;
- secrets hors du dépôt (`.env`), clés `service_role` jamais exposées au client.

## 9. Conventions de développement

- **Langue :** prose, documentation, commentaires et messages de commit en français ; le code,
  les chemins et les commandes restent universels.
- **Migrations :** `apps/supabase/migrations/NNNN_nom.sql`, numérotées sur 4 chiffres,
  idempotentes, RLS incluse.
- **Routes API :** session vérifiée d'abord, client RLS par défaut, `service_role` seulement
  après contrôle d'accès explicite.
- **Commits :** un commit par étape terminée, message qui dit ce que ça change pour l'usager.

## 10. Découpage en lots (esquisse)

| Lot | Contenu | Résultat visible |
| --- | --- | --- |
| **1 — Fondations** | Infra Docker isolée, Supabase, squelette Next.js, inscription / connexion, choix du rôle, profil de base | Deux personnes peuvent créer un compte, chacune avec son rôle, et se connecter |
| **2 — Rencontre** | Profils complets, annuaire des référents, filtres, demande de mise en relation, acceptation / refus | Un chercheur trouve un référent et obtient un accompagnement |
| **3 — Accompagnement** | Messagerie, documents (CV), suivi des démarches, tableau de bord des deux côtés | La relation vit dans la durée |
| **4 — Exploitation** | Administration, modération, statistiques, mise en ligne HTTPS | Le service tourne pour de vrai |

## 11. Points à trancher

1. **Vocabulaire** — « chercheur » convient-il en interface, ou préfères-tu « candidat »,
   « accompagné », autre chose ?
2. **Qui sont les référents** — bénévoles, professionnels d'une structure (mission locale,
   école, entreprise), ou les deux ? Faut-il les valider avant publication ?
3. **La structure est-elle un acteur** — faut-il modéliser les organismes (mission locale,
   école, entreprise) en plus des personnes, avec plusieurs référents rattachés ?
4. **Combien de relations** — un chercheur peut-il être suivi par plusieurs référents en même
   temps ? Un référent a-t-il un plafond de personnes suivies ?
5. **Qui choisit** — le chercheur choisit son référent dans l'annuaire (hypothèse retenue), ou
   bien un administrateur affecte, ou le système propose ?
6. **Nom de domaine** — lequel pour la mise en ligne ?
7. **Conservation des données** — combien de temps garde-t-on un dossier inactif ?
