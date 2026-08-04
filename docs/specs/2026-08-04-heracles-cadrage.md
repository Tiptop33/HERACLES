# HERACLES — cadrage

- **Date :** 2026-08-04
- **Version :** 2 — révisée après le relevé de l'application Bubble existante
- **Statut :** à valider ; les points ouverts sont listés en fin de document
- **⚠️ Projet 100 % indépendant d'EKOPLAN / MyCollabus** (aucun code, aucune base, aucun
  conteneur, aucun domaine commun).

> **Ce que cette version 2 change.** La version 1 avait été écrite sans connaître
> l'application existante : elle décrivait un produit plausible, pas le vôtre. Le relevé du
> modèle Bubble (voir [`2026-08-04-modele-bubble.md`](2026-08-04-modele-bubble.md)) a corrigé
> quatre choses — le vocabulaire, l'existence des loges, la place centrale des offres d'emploi,
> et le fait qu'il y a **deux** rôles d'accompagnement au lieu d'un.

---

## 1. À quoi sert HERACLES

HERACLES accompagne des personnes en recherche d'emploi, d'alternance ou de stage. Chacune est
suivie par un **référent** qui la conseille dans la durée, et présentée par un **parrain**. Les
uns et les autres se rattachent à une **loge**, le groupe local qui organise les réunions et
tient ses documents.

Le produit n'est pas un site d'annonces : c'est **l'outil de travail d'une association qui
accompagne des gens**. Les offres d'emploi y servent de matière — on les rapproche des
candidats — mais la valeur est dans le suivi.

## 2. D'où l'on part

Une application Bubble (`heracles-42268`) tourne déjà et porte de vraies données :

| | |
| --- | ---: |
| Candidats suivis | 107 |
| Comptes (référents et parrains) | 71 |
| Loges | 3 |
| Offres d'emploi | 4 539 |
| Documents | 135 |

HERACLES la remplace. Le modèle de données a été repris à l'identique dans la migration
`0002_modele_bubble.sql` — la reprise des données viendra ensuite.

## 3. Les acteurs

| Acteur | Ce qu'il fait |
| --- | --- |
| **Candidat** | Tient sa fiche à jour — parcours, compétences, CV, ce qu'il cherche — consulte les offres qu'on lui propose, échange avec son référent. |
| **Référent** | Suit les candidats qui lui sont rattachés : conseille, relit, rapproche des offres, note l'avancement. |
| **Parrain** | Présente un candidat et l'introduit. Distinct du référent : un candidat a les deux. |
| **Loge** | Le groupe local : ses membres, ses réunions, ses documents, sa numérotation de candidats. |
| **Administrateur** | Gère les loges, les comptes, les nomenclatures et les modèles d'emails. |

## 4. Vocabulaire

**candidat**, **référent**, **parrain**, **loge**, **offre**. Ces mots viennent de
l'application existante et s'emploient partout à l'identique — interface, code, tables,
colonnes. La version 1 disait « chercheur » : ce mot est abandonné.

## 5. Périmètre

**Ce que HERACLES doit savoir faire**
- Comptes et connexion, avec les rôles candidat / référent / parrain / administrateur.
- La fiche candidat complète : identité, parcours, compétences, permis, mobilité, documents.
- Le rattachement candidat ↔ référent ↔ parrain ↔ loge.
- Les offres d'emploi : réception depuis France Travail, recherche, rapprochement avec un
  candidat.
- Les documents d'une loge et ceux d'un candidat (CV, lettre, CV anonyme).
- Les réglages de l'association et les modèles d'emails.
- Une administration : loges, comptes, nomenclatures.

**Hors périmètre pour l'instant**
- Candidature en ligne directement depuis HERACLES.
- Appariement automatique candidat ↔ offre (le rapprochement reste humain).
- Application mobile native — le web est responsive.
- Paiement, abonnement.

## 6. Modèle de données

Huit tables, reprises de Bubble : `candidat`, `referent`, `loge`, `loge_membre`, `entreprise`,
`offre_emploi`, `document`, `parametre` — plus `profil`, qui porte l'identité des comptes
HERACLES. Le détail champ par champ est dans
[`2026-08-04-modele-bubble.md`](2026-08-04-modele-bubble.md).

**Ce qui manque encore** : une dizaine de types référencés par des champs mais non exposés par
l'API Bubble (`PROVINCE`, `LOGES`, secteurs d'activité, métiers, codes NAF, tâches…), et les
valeurs d'une quinzaine de listes de choix. Il faut la liste complète des types de données
depuis l'éditeur pour finir.

**Règles d'accès** — toutes les tables sont sous RLS, fermées par défaut :
- un candidat ne voit que sa fiche ;
- un référent ne voit que les candidats qui lui sont rattachés ;
- un parrain, que ceux qu'il parraine ;
- les documents suivent la règle de ce à quoi ils se rattachent ;
- offres et réglages sont lisibles par toute personne connectée — ils ne concernent personne ;
- l'administrateur passe par des routes serveur qui vérifient son rôle avant tout élargissement.

## 7. Stack technique

| Brique | Choix |
| --- | --- |
| Base, auth, API, stockage | **Supabase auto-hébergé** en Docker (PostgreSQL, GoTrue, PostgREST, Storage, Kong) |
| Application web | **Next.js** (App Router, TypeScript), responsive, conteneurisée |
| Accès aux données | `@supabase/ssr` côté serveur, RLS appliquée ; routes API serveur pour les cas privilégiés |
| Emails | boîte de test en local, SMTP transactionnel en production |
| Hébergement | VPS, Docker Compose, Nginx, HTTPS Let's Encrypt |
| Tests | Vitest pour la logique, scripts SQL pour la base et la RLS |

## 8. Isolation vis-à-vis de MyCollabus — non négociable

| | MyCollabus | **HERACLES** |
| --- | --- | --- |
| Dépôt | `Tiptop33/EKOPLAN` | `Tiptop33/HERACLES` |
| Projet Docker | `mycollabus-prod` | `heracles-prod` |
| Conteneurs Supabase | `supabase-db`, `supabase-kong`… | préfixés `heracles-` (**obligatoire** : sinon collision de noms) |
| Dossier de la stack | `/opt/supabase` | `/opt/supabase-heracles` |
| API Supabase (Kong) | `127.0.0.1:8000` | `127.0.0.1:8100` |
| PostgreSQL | `5432` / `5442` | `5443` (local : `54332`) |
| Application web | `3001` | `3002` |
| Base de données | `mycollabus` | `heracles` |
| Domaine | `mycollabus.fr` | à définir (point ouvert n° 4) |

## 9. Données personnelles

HERACLES manipule des parcours, des coordonnées, des CV, et le rattachement de personnes
nommées à une organisation. C'est la catégorie de données la plus sensible qui soit.

- **Fermé par défaut** : aucune table de données personnelles n'est lisible tant qu'un écran
  n'a pas justifié sa policy.
- Un référent ne voit un dossier **que s'il lui est rattaché**.
- Consentement explicite à l'inscription, information claire sur qui voit quoi.
- Suppression du compte possible, documents compris.
- Durée de conservation d'un dossier inactif à fixer (point ouvert n° 5).
- Secrets hors du dépôt, clé `service_role` jamais exposée au client.

> **Constat du 2026-08-04.** Au moment du relevé, l'API Data de l'application Bubble répondait
> à tout Internet sans jeton : les 107 fiches candidats et les 71 comptes étaient publics. Le
> correctif a été transmis. C'est la raison pour laquelle HERACLES est fermé par défaut, et non
> ouvert puis restreint.

## 10. Découpage en lots

| Lot | Contenu | Résultat visible |
| --- | --- | --- |
| **1 — Fondations** ✅ | Infra isolée, comptes, connexion, profil | Deux personnes créent un compte et se connectent |
| **2 — Reprise** | Import des données Bubble, résolution des liens, contrôle de complétude | Les 107 candidats et les 71 comptes vivent dans HERACLES |
| **3 — La fiche candidat** | Consultation et modification, documents, RLS candidat / référent / parrain | Un référent travaille vraiment sur ses candidats |
| **4 — Les offres** | Réception France Travail, recherche, rapprochement avec un candidat | Un référent propose une offre à un candidat |
| **5 — La loge** | Membres, réunions, documents, administration, modèles d'emails | L'association pilote son activité |
| **6 — Mise en ligne** | HTTPS, sauvegardes, durcissement, bascule depuis Bubble | Le service tourne pour de vrai |

L'ordre des lots 3 et 4 se discute : il dépend de ce qui te fait le plus gagner de temps.

## 11. Décisions et points ouverts

**Tranché**
1. Vocabulaire : candidat, référent, parrain, loge, offre — repris de l'application existante
   (2026-08-04, version 2).
2. Les loges sont modélisées : ce sont des acteurs, pas un champ de profil.
3. Les offres d'emploi sont dans le périmètre.
4. Fermé par défaut : RLS sans policy tant qu'un écran ne la justifie pas.

**Ouvert**
1. **Parrain et référent** — un candidat peut-il en avoir plusieurs de chaque ? Un référent
   a-t-il un plafond de candidats suivis ?
2. **Qui rattache** — le référent est-il désigné par la loge, par un administrateur, ou le
   candidat le choisit-il ?
3. **Les comptes candidats** — dans Bubble, les 107 candidats ne semblent pas avoir de compte
   de connexion : les fiches sont tenues par les référents. Les candidats doivent-ils pouvoir
   se connecter dans HERACLES, ou reste-t-on sur des fiches tenues par les référents ?
4. **Nom de domaine** — lequel pour la mise en ligne ? Nécessaire au lot 6.
5. **Conservation** — combien de temps garde-t-on un dossier de candidat inactif ?

Le point n° 3 est le plus structurant : il décide de la moitié des écrans.
