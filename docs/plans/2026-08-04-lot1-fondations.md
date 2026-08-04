# Lot 1 — Fondations

- **Date :** 2026-08-04
- **Spec :** [`docs/specs/2026-08-04-heracles-cadrage.md`](../specs/2026-08-04-heracles-cadrage.md)
- **But :** deux personnes peuvent créer un compte — l'une comme chercheur, l'autre comme
  référent — se connecter, et remplir leur profil. Rien de plus, mais ça marche vraiment.

## Choix techniques du lot

- **Supabase CLI en local** (`npx supabase start`) : elle monte toute la pile (Postgres, auth,
  API, stockage, boîte mail de test) en une commande et **joue les migrations toute seule**.
  Les ports sont figés dans `supabase/config.toml` — décalés de ceux de MyCollabus.
- **Stack Supabase officielle en production**, clonée dans `/opt/supabase-heracles`, projet
  Docker `heracles`, conteneurs préfixés `heracles-`. Les mêmes fichiers `.sql` s'y appliquent
  via `psql --single-transaction`.
- **Next.js (App Router, TypeScript)** avec `@supabase/ssr` : la session vit dans des cookies,
  le serveur lit les données **sous RLS**.

## Ports (aucun ne croise MyCollabus)

| | Local (CLI) | Production |
| --- | --- | --- |
| API Supabase | `54331` | `127.0.0.1:8100` |
| PostgreSQL | `54332` | interne au réseau Docker |
| Studio | `54333` | — |
| Boîte mail de test | `54334` | SMTP réel |
| Application web | `3002` | `127.0.0.1:3002` |

## Arborescence cible

```
HERACLES/
  .env.example                  # modèle versionné (jamais de secret)
  supabase/
    config.toml                 # ports et réglages auth de la pile locale
    migrations/
      0001_profil.sql           # profil, rôle, RLS, création auto à l'inscription
  apps/
    web/                        # application Next.js
      src/
        app/                    # pages (App Router)
        lib/                    # clients Supabase (navigateur / serveur)
      middleware.ts             # rafraîchit la session à chaque requête
  infra/
    docker-compose.prod.yml     # l'app web en conteneur
  docs/
    specs/ plans/
```

---

## PHASE 0 — Socle

### Tâche 0.1 — Modèle d'environnement
- [ ] `.env.example` : URL et clés Supabase (local **et** production commentée), URL publique
      de l'app, port `3002`. Aucune valeur secrète réelle.
- **Vérification :** le fichier ne contient aucune clé valide.

### Tâche 0.2 — Pile Supabase locale isolée
- [ ] `supabase/config.toml` : ports du tableau ci-dessus, inscription par email activée,
      confirmation d'email exigée, URL de retour vers `http://localhost:3002/auth/callback`.
- **Vérification :** `npx supabase start` démarre, Studio répond sur `54333`.

### Tâche 0.3 — Squelette Next.js
- [ ] `apps/web` : Next.js + TypeScript, `@supabase/supabase-js`, `@supabase/ssr`, `zod`.
- [ ] `src/lib/supabase-browser.ts` et `src/lib/supabase-server.ts` (client lié aux cookies).
- [ ] `middleware.ts` : rafraîchissement de session à chaque requête.
- [ ] Page d'accueil : ce qu'est HERACLES, deux entrées « je cherche » / « j'accompagne ».
- **Vérification :** `npm run build` passe, `npm run dev` sert sur `3002`.

## PHASE 1 — Comptes

### Tâche 1.1 — Migration `0001_profil.sql`
- [ ] Type `role_utilisateur` : `chercheur` | `referent` | `admin`.
- [ ] Table `profil` (clé = `auth.users.id`) : rôle, nom, prénom, téléphone, ville, code postal,
      présentation, dates.
- [ ] **RLS** : chacun lit et modifie **sa** ligne, et rien d'autre. Le rôle n'est pas
      modifiable par l'usager après création.
- [ ] Déclencheur `on auth.users insert` : crée le profil avec le rôle choisi à l'inscription
      (lu dans les métadonnées), `chercheur` par défaut.
- **Vérification :** migration jouée, insertion d'un utilisateur de test → profil créé ; une
  requête sur le profil d'autrui ne renvoie rien.

### Tâche 1.2 — Inscription
- [ ] `/inscription` : rôle (chercheur / référent), email, mot de passe, nom, prénom.
- [ ] Validation `zod`, messages d'erreur en français, mot de passe d'au moins 8 caractères.
- [ ] Envoi de la confirmation par email ; page « vérifiez votre boîte mail ».
- **Vérification :** l'email arrive dans la boîte de test, le lien connecte.

### Tâche 1.3 — Connexion, session, déconnexion
- [ ] `/connexion`, `/auth/callback`, déconnexion.
- [ ] Redirection selon le rôle : chercheur → `/espace/chercheur`, référent → `/espace/referent`.
- [ ] Les espaces sont protégés : sans session, retour à `/connexion`.
- **Vérification :** parcours complet inscription → email → connexion → espace → déconnexion.

### Tâche 1.4 — Profil
- [ ] `/mon-compte` : lecture et modification du profil (hors rôle et email).
- [ ] Écriture via route serveur, sous RLS, jamais de `service_role` ici.
- **Vérification :** modification enregistrée, visible après rechargement.

### Tâche 1.5 — Coquilles des deux espaces
- [ ] `/espace/chercheur` et `/espace/referent` : en-tête, menu, message d'accueil, et la suite
      annoncée (« l'annuaire arrive au lot 2 »).
- **Vérification :** chaque rôle atterrit dans son espace, jamais dans celui de l'autre.

## PHASE 2 — Filet de sécurité

### Tâche 2.1 — Tests
- [ ] Vitest sur la logique pure : validation des formulaires, choix de la redirection selon le
      rôle, normalisation des champs.
- **Vérification :** `npm test` au vert.

### Tâche 2.2 — Contrôle des règles d'accès
- [ ] Test qui prouve qu'un utilisateur ne peut **pas** lire le profil d'un autre.
- **Vérification :** la tentative renvoie zéro ligne, pas une erreur silencieuse.

---

## Ce que le lot 1 ne fait pas

Annuaire, demande de mise en relation, messagerie, documents, modération : lot 2 et suivants.
La table `referent_profil` et son champ `valide` arrivent avec l'annuaire — inutile de les
créer avant d'avoir un écran qui s'en sert.
