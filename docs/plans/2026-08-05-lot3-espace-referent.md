# Lot 3 — L'espace référent

- **Date :** 2026-08-05
- **Spec :** [`docs/specs/2026-08-04-heracles-cadrage.md`](../specs/2026-08-04-heracles-cadrage.md) (§ 10)
- **Maquette :** [`docs/maquettes/Wireframes HERACLES.dc.html`](<../maquettes/Wireframes HERACLES.dc.html>)
  et ses [notes de construction](<../maquettes/Wireframes HERACLES.dc-notes.md>)
- **Échéance visée :** 30 septembre 2026
- **But :** un référent se connecte, voit ses candidats, ouvre une fiche, la complète. Et il ne
  voit que les siens — pas parce qu'une page filtre, parce que la base refuse.

## Ce qui a été construit

### La base

Migration [`0006_espace_referent.sql`](../../supabase/migrations/0006_espace_referent.sql), et
son test [`0006_espace_referent.test.sql`](../../supabase/tests/0006_espace_referent.test.sql).

| | |
| --- | --- |
| `candidat.ville`, `candidat.code_postal` | l'écran de saisie les demande séparément ; Bubble n'avait que `adresse` |
| `rattacher_referent_au_compte()` | relie un compte HERACLES à sa fiche reprise de Bubble, par l'adresse email |
| `referent_courant()` | la fiche de référent de la personne connectée — `security definer`, donc sans récursion de policy |
| `candidat_lecture_accompagnes` | il voit les candidats dont il est référent **ou** parrain |
| `candidat_modification_accompagnes` | il modifie les mêmes, et aucun autre |
| `referent_lecture_binome` | il lit le nom de son binôme sur ces fiches, et rien de plus |
| `loge_lecture_sienne` | il lit sa loge et celles de ses candidats |
| `candidat_avant_modification` | fige `referent_id`, `parrain_id`, `loge_id`, `numero`, `profil_id`, `bubble_id` |

**Ni insertion ni suppression** : aucun écran ne crée ni ne supprime un candidat au lot 3, donc
aucune policy ne l'autorise. `document`, `entreprise` et `loge_membre` restent entièrement
fermées — rien ne les a encore justifiées.

### Le défaut que la vérification en conditions réelles a mis au jour

Migration [`0007_droits_tables.sql`](../../supabase/migrations/0007_droits_tables.sql).

Aucune migration ne posait de `grant`, en comptant sur les privilèges par défaut de Supabase. Or
ceux-ci dépendent du rôle qui crée la table : pour le rôle `postgres`, celui qui joue nos
migrations, ils ne donnent à `authenticated` que `truncate`, `references` et `trigger`. **Pas de
`select`.**

L'application ne lisait donc aucune table contre un vrai Supabase. La connexion réussissait — elle
passe par le schéma `auth` — puis la lecture du profil échouait en silence, et tout le monde
atterrissait dans l'espace chercheur. Le lot 1 en souffrait déjà ; le harnais de test, qui
grantait tout, le masquait.

Trois choses ont changé :

- **La migration 0007** ouvre table par table : lecture des six tables que les écrans affichent,
  écriture sur `profil` et `candidat` seulement, rien pour `anon`, tout pour `service_role`.
  C'est plus serré que le réglage par défaut de Supabase, qui ouvrait tout à tout le monde et
  laissait la RLS seule en défense.
- **Le harnais** (`supabase/tests/harnais.sql`) reproduit désormais la vraie parcimonie de
  Supabase. Un test de RLS n'a de valeur que si le `grant` qui le précède est celui de production.
- **Un test** (`0007_droits_tables.test.sql`) éprouve les deux verrous séparément : le `grant` dit
  à quelles tables on peut s'adresser, la RLS quelles lignes en sortent.

Toute table créée par une migration future naît fermée et devra s'ouvrir explicitement.

### L'application

```
apps/web/src/
  lib/
    suivi.ts        # état du suivi et taux de remplissage — fonctions pures, éprouvées
    format.ts       # dates en français, initiales, étiquettes
    candidat.ts     # lecture des candidats, sous RLS
  components/
    BarreReferent.tsx
    BoutonImprimer.tsx
  app/
    espace/referent/
      page.tsx                              # écran 1 — Mes candidats
      candidats/[id]/page.tsx               # écran 2 — la fiche
      candidats/[id]/modifier/              # écran 3 — la saisie
      candidats/[id]/document/[genre]/      # téléchargement sous adresse signée
    api/candidats/[id]/route.ts             # enregistrement, validé par zod
```

## Les deux décisions qui méritent d'être dites

**Le rattachement se fait à l'inscription, pas à chaque requête.** Un référent repris de Bubble
n'a pas de compte HERACLES : sa fiche porte son email, et rien d'autre. Le jour où il s'inscrit
avec la même adresse, un déclencheur relie les deux, une fois pour toutes. L'alternative —
comparer les emails dans chaque policy — aurait fait porter à chaque lecture le coût d'un
rapprochement, et confié le contrôle d'accès à une égalité de chaînes de caractères.

**Le filtre et la recherche s'appliquent en mémoire.** L'état du suivi est calculé, il n'existe
dans aucune colonne ; et un référent suit quelques dizaines de candidats, pas des milliers. Cela
évite au passage de recopier un mot saisi par l'usager dans une expression de filtre PostgREST.
Si un référent finissait par en suivre des centaines, ce serait à revoir — pas avant.

## Ce qui reste ouvert

Les quatre questions du pied de la maquette, telles quelles :

1. **Les valeurs exactes des listes de choix.** « Type de recherche », « Situation », « Clôture »,
   « Appréciation » sont du texte libre venant de Bubble. L'écran de saisie propose Alternance /
   Emploi / Stage et garde la valeur d'origine quand elle est autre — mais ce sont des listes
   devinées, pas relevées. Il faut les option sets Bubble pour en faire de vrais référentiels.
2. **Le taux de remplissage : utile, ou gadget ?** Il montre où le travail reste à faire ; il peut
   aussi se lire comme une note donnée aux référents. Il se retire en supprimant une colonne.
3. **Les étapes réelles du suivi.** « Suivi / À contacter / Clôturé » est déduit de `cloture`,
   `archive` et de la date de dernière modification. Si les référents raisonnent avec d'autres
   étapes, la règle tient dans une seule fonction (`etatDuSuivi`).
4. **Ce qui manque à l'écran.** La question qui compte le plus, et à laquelle seul l'usage répond :
   qu'est-ce qu'un référent fait tous les jours qu'on ne voit pas ici ?

S'y ajoutent deux points hérités du cadrage, que le lot 5 tranchera :

- **Qui rattache un candidat à un référent ?** L'écran de modification dit « depuis
  l'administration de la loge » — cette administration n'existe pas encore.
- **Un candidat peut-il avoir plusieurs référents ou plusieurs parrains ?** Le modèle repris n'en
  prévoit qu'un de chaque ; la RLS suit le modèle.

## Ce qui n'est pas dans ce lot

- Les documents d'une loge (table `document`) — lot 5.
- Le rapprochement candidat ↔ offre — lot 4.
- La création et la suppression d'un candidat — aucune policy, volontairement.
- Le rapatriement des fichiers depuis Bubble : `outils/rapatrier-fichiers.mjs` existe et doit
  tourner avant la bascule. En attendant, la fiche affiche « chez Bubble » pour les documents dont
  on n'a que l'adresse d'origine.

## Vérifier

```bash
cd apps/web && npm run lint && npm test && npm run build
PGHOST=localhost PGPORT=54332 PGUSER=postgres ./supabase/tests/executer.sh
```
