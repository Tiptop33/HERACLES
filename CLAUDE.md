# HERACLES

Application d'accompagnement vers l'emploi : des **candidats** en recherche d'emploi,
d'alternance ou de stage sont suivis par des **référents** et des **parrains**, rattachés à des
**loges**. Elle remplace une application Bubble existante (`heracles-42268`), dont le modèle de
données a été repris.

## ⏳ Échéance : 5 décembre 2026

HERACLES doit être **en ligne et en service le 5 décembre 2026**, en remplacement de
l'application Bubble. Jalons visés (détail et marges dans le cadrage, § 10) :

| Fin | Lot |
| --- | --- |
| août | 2 — reprise des données Bubble |
| septembre | 3 — la fiche candidat |
| octobre | 4 — les offres d'emploi |
| 14 novembre | 5 — la loge et l'administration |
| 21 novembre | 6 — mise en ligne, puis deux semaines de vérification |
| **5 décembre** | **bascule depuis Bubble** |

Toute décision qui décale un lot doit être signalée : la date de bascule, elle, ne bouge pas.

## Langue

**Toutes les réponses sont rédigées en français.** Cela vaut pour les messages de discussion,
les messages de commit, les descriptions de pull request, les commentaires du code et la
documentation.

## Vocabulaire — un mot, une chose

Ces mots viennent de l'application existante. Ils s'emploient partout, à l'identique : dans
l'interface, dans le code, dans les noms de tables et de colonnes.

| Mot | Ce qu'il désigne |
| --- | --- |
| **candidat** | la personne accompagnée, en recherche d'emploi, d'alternance ou de stage |
| **référent** | celui qui suit le candidat dans la durée |
| **parrain** | celui qui présente le candidat et l'introduit |
| **loge** | le groupe local auquel se rattachent référents, candidats et documents |
| **offre** | une offre d'emploi, alimentée depuis France Travail |

Ne jamais écrire « chercheur », « demandeur d'emploi » ou « utilisateur » à la place de
« candidat ». Un vocabulaire flottant finit toujours par produire deux tables pour la même
chose.

## Sécurité — la règle qui prime sur les autres

L'application manipule des données personnelles de personnes vulnérables : parcours,
coordonnées, CV, et l'appartenance à une organisation. L'application d'origine les exposait à
tout Internet ; c'est précisément ce qu'il ne faut pas reproduire.

1. **Fermé par défaut.** Toute table porte `enable row level security`. Une policy ne s'ajoute
   qu'avec l'écran qui la justifie, et jamais plus large que cet écran.
2. **La RLS est le contrôle d'accès**, pas un filtre écrit dans une page. Une requête serveur
   qui « oublie » son `where` ne doit rien renvoyer de plus.
3. **`service_role` seulement après avoir vérifié les droits.** Cette clé contourne la RLS :
   d'abord la session, ensuite le contrôle métier, alors seulement `supabaseAdmin()`.
4. **Aucune donnée réelle dans le dépôt.** Ni export, ni copie de fiche, ni capture. Les tests
   fabriquent leurs propres données.
5. **Aucun secret dans le dépôt.** `.env` est ignoré ; `.env.example` ne contient que des
   valeurs d'exemple.

## Base de données

- Les migrations vivent dans `supabase/migrations/NNNN_nom.sql`, numérotées sur quatre
  chiffres, à la suite.
- **Idempotentes** : `if not exists`, `drop policy if exists` avant `create policy`,
  `on conflict do nothing` pour les seeds. Une migration doit pouvoir se rejouer.
- En-tête commentée : ce que ça change, et pourquoi.
- Schéma `public.` explicite.
- Toute table qui touche à une personne : RLS activée dans la migration qui la crée.
- **Toute migration s'accompagne de son test** dans `supabase/tests/NNNN_nom.test.sql`.

Avant tout commit touchant à la base :

```bash
./supabase/tests/executer.sh          # harnais + migrations + tests, base jetable
```

Le harnais (`supabase/tests/harnais.sql`) reconstitue le minimum de Supabase — schéma `auth`,
`auth.uid()`, rôles `anon` / `authenticated` / `service_role` — ce qui permet d'éprouver la RLS
sur un PostgreSQL nu, sans lancer les dix conteneurs de la pile.

Un test de RLS se joue **en devenant l'utilisateur** :

```sql
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"<uuid>"}';
  -- ce que cette personne voit, et rien d'autre
commit;
```

## Application web

- `apps/web`, Next.js en App Router, TypeScript.
- **`proxy.ts`, pas `middleware.ts`** : depuis Next.js 16.2 l'ancienne convention est dépréciée.
- Next.js de ce dépôt embarque sa documentation dans `node_modules/next/dist/docs/` : la lire
  avant d'inventer une convention de route ou de fichier.
- Routes serveur : session vérifiée d'abord, `supabaseServer()` (donc RLS) par défaut.
- Validation des entrées avec `zod`, messages d'erreur en français.
- Messages d'erreur d'authentification volontairement neutres : ne jamais révéler qu'une
  adresse est inscrite.

Avant tout commit touchant à l'application :

```bash
cd apps/web && npm run lint && npm test && npm run build
```

## L'écran ne change pas sans qu'on l'ait demandé

**Toute modification visuelle se demande avant de se faire.** Ajouter un élément, en retirer
un, en afficher un, en masquer un, en déplacer un, remplacer un libellé par une icône, changer
un ordre d'affichage : la question se pose d'abord, et l'on attend la réponse.

Ce qui a été demandé explicitement est déjà répondu — on ne redemande pas une corbeille qu'on
vient de commander. La règle porte sur **ce qui vient en plus** : les décisions prises en
chemin, jugées « cohérentes » ou « pendant qu'on y est ». C'est exactement là qu'un écran
dérive sans que personne ne l'ait voulu.

Deux exceptions, et deux seulement :

- **une correction de panne** — un élément qui n'apparaît pas, une donnée invisible, un bouton
  qui ne mène nulle part. Rétablir ce qui devait être là n'est pas un changement d'écran ;
- **ce qu'impose une règle de ce fichier** — la sécurité, le vocabulaire, la langue.

Dans le doute, poser la question. Une question coûte une minute ; un écran qu'il faut défaire
coûte une journée, et la confiance de ceux qui s'en servent.

## Isolation vis-à-vis de MyCollabus

HERACLES est **totalement isolé** d'EKOPLAN / MyCollabus : dépôt, nom de stack, ports, base de
données et domaine distincts. Ne jamais réutiliser les volumes, les ports, les identifiants ni
les données d'un autre projet.

| | Local | Production |
| --- | --- | --- |
| Application web | `3002` | `127.0.0.1:3002` |
| API Supabase (Kong) | `54331` | `127.0.0.1:8100` |
| PostgreSQL | `54332` | interne au réseau Docker |
| Studio | `54333` | — |
| Boîte mail de test | `54334` | SMTP réel |

Stack Docker `heracles-prod`, conteneurs préfixés `heracles-`, base `heracles`.

L'isolation vaut aussi pour l'**apparence** : HERACLES a sa propre identité visuelle. Ne pas
reprendre la charte de MyCollabus — ni ses couleurs, ni ses composants. Ce sont deux produits
pour deux publics : des professionnels du bâtiment d'un côté, des personnes en recherche
d'emploi et leurs accompagnants de l'autre.

## Commits

Un commit par étape terminée. Le message dit **ce que ça change pour la personne qui s'en
sert**, pas la liste des fichiers touchés.

## Documentation

- Cadrage : `docs/specs/2026-08-04-heracles-cadrage.md`
- Modèle repris de Bubble : `docs/specs/2026-08-04-modele-bubble.md`
- Plans par lot : `docs/plans/`
- **MAJBUBBLE** — la reprise finale des données Bubble, à rejouer au plus tard le
  5 décembre 2026 : `docs/MAJBUBBLE.md`. C'est la seule opération de la bascule qui
  ne se rattrape pas — passé la fermeture, ni l'API ni le CDN de Bubble ne répondent.
- **Sauvegarde** — `docs/sauvegarde.md`. Le serveur porte des données réelles :
  base, fichiers, et la copie qui doit en sortir. À lire avant toute opération
  qui touche à la base.
