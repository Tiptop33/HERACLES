# MAJBUBBLE — la reprise finale des données Bubble

- **Nom retenu :** `MAJBUBBLE`
- **Échéance :** au plus tard le **5 décembre 2026**, jour de la bascule
- **À faire aussi :** au moins une fois **à blanc**, deux semaines avant

La reprise du 4 août a servi à modeler la base. Elle sera périmée le jour venu :
quatre mois de fiches modifiées, de candidats entrés, d'offres renouvelées. Il
faut la rejouer une dernière fois, au plus près de la bascule.

C'est **la seule opération de la mise en ligne qui ne se rattrape pas** : passé
la fermeture de l'application Bubble, ni son API ni son CDN ne répondent plus.
Ce qui n'a pas été repris ce jour-là est perdu.

## La commande

```bash
sudo /opt/heracles-essai-depot/infra/essai/reprendre-bubble.sh --fichiers
```

Elle enchaîne quatre temps, et elle est **rejouable** — une fiche déjà reprise
est mise à jour, jamais dupliquée :

1. **Les tables métier**, depuis la base Bubble *en service* : candidats,
   référents, loges, offres, documents, entreprises, paramètres.
2. **Les référentiels**, depuis la base de *l'éditeur*, en `SEULEMENT_BRUT=1` —
   les deux bases n'exposent pas les mêmes types, et la seconde ne doit pas
   écraser la première.
3. **Les tâches**, dépliées de la réserve brute vers le journal des candidats.
   Aucun réseau : cette étape relit ce que les deux premières ont écrit.
4. **Les fichiers**, du CDN de Bubble vers le stockage Supabase. Reprenable :
   interrompue, relancée, elle repart où elle en était.

Sur la production, remplacer le chemin par celui du dépôt de production.

## Avant de la lancer

| | |
| --- | --- |
| **Sauvegarder** | `sudo /opt/heracles-essai-depot/infra/essai/sauvegarder.sh`, et **sortir l'archive du VPS** — voir [`sauvegarde.md`](sauvegarde.md) |
| **L'API Bubble doit répondre** | si elle a été refermée entre-temps, la rouvrir avec un jeton pour la durée de l'opération, et la refermer après |
| **Un jeton** | `BUBBLE_TOKEN=xxx sudo -E …` — l'API répond aussi sans, mais c'est à éviter |
| **La pile doit être en marche** | migrations jouées, `auth` en place |

## Après

**Compter.** La commande finit par un tableau. Le comparer aux comptes de
Bubble, relevés le même jour :

```
https://heracles-42268.bubbleapps.io/api/1.1/obj/<type>?limit=1
```

Le champ `remaining` du JSON, plus un, donne le total. Un écart n'est pas
forcément une erreur — une fiche peut avoir été supprimée entre les deux
lectures — mais il doit s'expliquer.

**Vérifier que les fichiers sont bien passés.** Tant qu'une colonne
`..._chemin` est vide alors que son `..._url` ne l'est pas, le fichier reste à
rapatrier. La migration `0005_fichiers.sql` porte les requêtes de contrôle.

**Vérifier que les tâches sont bien arrivées.** La commande affiche le bilan du
déversement ; il doit tomber juste avec ce que Bubble annonce, et `sans_candidat`
doit être à zéro :

```sql
select count(*) as en_reserve from public.bubble_brut where type_bubble = 'tache';
select count(*) as dans_le_journal from public.suivi where bubble_id is not null;
```

**Rattacher les comptes.** Les fiches arrivent de Bubble ; les comptes de
connexion, eux, existent déjà. Rien ne les lie tant qu'on ne le demande pas :

```bash
docker exec -i <prefixe>-db psql -U postgres -d postgres \
  -c "select public.rattacher_les_comptes_orphelins() as comptes_rattaches"
```

Elle rapproche les adresses identiques, ne touche qu'une fiche libre, ne
déplace jamais un rattachement existant, et se rejoue sans risque. Un compte
sans fiche ne voit ni collègues, ni candidats : c'est à faire le jour même.

**Refermer l'API Bubble** et régénérer ses jetons. Voir
`docs/reprise-bubble-releve.md`.

## Ce que MAJBUBBLE ne fait pas

**Les mots de passe.** Bubble ne les expose pas, et c'est heureux. Les 71
référents ne pourront pas se connecter avec le leur : chacun doit recevoir une
invitation et en choisir un nouveau. **Cela ne s'improvise pas le jour J** —
c'est un envoi groupé à préparer, et un délai à laisser aux gens.

**Les rattachements manquants.** Douze référents ne sont dans aucune loge. Dans
HERACLES, un référent sans loge ne voit rien : ni collègues, ni candidats en
attente, ni documents. À corriger avant la bascule, pas après. L'annuaire les
regroupe : *Référents*, puis la loge « Sans loge » — et chaque fiche se corrige
sur place.

**Les sept types vides.** `appels`, `tag`, `tenue`, `ft_auth`,
`offre_cliquee`, `emailrelance`, `candidat_offre_cliquee` : zéro enregistrement
au 4 août. À revérifier le jour venu, ils ont pu se remplir depuis.

**Tout ce que la base en service n'expose pas.** Vérifié le 7 août 2026, et
toujours vrai le 8 : `/api/1.1/meta` ne rend que sept types — `candidats`,
`user`, `loges_referents`, `info_entreprise`, `offreemploi`, `pdfs`, `global`.
Trois colonnes de notre modèle pointent vers des types absents de cette liste :
`candidat.taches_bubble_ids` (`tache`), `referent.canaux_bubble_ids`
(`channel`), `parametre.whatsapp_bubble_ids` (`groupes_whatsapp`).

**La base de l'éditeur, elle, expose les trois.** Et les identifiants sont
communs aux deux bases — les 83 candidats de l'éditeur portent les mêmes `_id`
que dans la base en service. C'est ce qui permet de reprendre ces types-là de
l'éditeur et de les rattacher aux vraies fiches. Relevé du 8 août :

| Type | Éditeur | En service | Ce qu'on en fait |
| --- | ---: | --- | --- |
| `tache` | **467** | 404 | déversé dans le journal — voir ci-dessous |
| `groupes_whatsapp` | 1 | 404 | en réserve brute, rien n'en dépend |
| `channel` | 0 | 404 | vide, rien à reprendre |

### Les tâches : 467, et non une seule

*Correction du 8 août 2026.* Cette page annonçait « une tâche, sur 107
candidats ». **C'était lu du mauvais côté du lien.** Le champ `candidat.TACHES`
— la liste inverse — n'est effectivement renseigné que sur une fiche ; mais le
lien qui compte est porté par la tâche, dans son champ `Num CANDIDAT tach`.
Compté depuis le type lui-même : **467 tâches, sur 87 candidats**, de mars 2023
au 30 juillet 2026, écrites par 7 référents. Il y a bien un historique de suivi
à sauver, et il est déjà là.

Deux pièges de nommage expliquent qu'on soit passé à côté : le type s'appelle
`tache`, au singulier, et non `TACHES` qui est le nom du champ ; et il n'existe
que dans la base de l'éditeur, celle qu'on n'interroge qu'en `SEULEMENT_BRUT`.

Les 467 sont donc **déjà dans `bubble_brut`** depuis la reprise du 7 août. La
migration `0023_taches_bubble.sql` les déplie dans le journal des candidats
(`suivi`) : un candidat, un auteur, un jour, un état. Elle se rejoue sans
doubler, et rattrape au passage les tâches dont le candidat n'était pas encore
en base. Le compte s'obtient en une ligne :

```sql
select * from public.deverser_taches_bubble();
```

`reprendre-bubble.sh` l'appelle désormais tout seul, et les migrations aussi au
déploiement : il n'y a rien à lancer à la main.

*Ce qui resterait propre à faire avant la bascule* : exposer `tache` sur la
base **en service** (Data → Data types, « expose via API », puis **déployer** —
le réglage est versionné). L'éditeur tient ce type à jour, mais rien ne le
garantit d'ici décembre ; la base en service, elle, ne ment jamais.
`import-bubble.mjs` est prêt pour ce jour-là : dès que la base en service
expose un type, la passe de l'éditeur cesse d'y toucher.

**En revanche, `ARCHIVER` ne doit pas être perdu — et il l'est aujourd'hui.**
Relevé du 7 août sur les 107 fiches Bubble :

| `ARCHIVER` | fiches |
| --- | ---: |
| `Oui` | 94 |
| `Non` | 13 |

Aucune fiche n'est vide. Or au 7 août, la colonne `candidat.archive` était
nulle sur l'instance d'essai : la reprise en base datait d'avant la
correspondance `ARCHIVER → archive` que porte `import-bubble.mjs`. **Rejouer
`reprendre-bubble.sh` a suffi** — et l'écran est passé de 107 dossiers actifs
à 13. C'est la preuve que la correspondance est bonne ; c'est aussi le rappel
qu'une reprise ancienne ne contient pas ce qu'un import récent saurait
prendre.

Ces treize « Non » sont les candidats **en cours** — et c'est exactement le
« 13 en cours » que la maquette 1c annonce en tête de son volet. Sans cette
colonne, le poste de travail présente 107 dossiers actifs au lieu de 13.

*À refaire le jour de la bascule*, et à vérifier plutôt qu'à supposer :

```sql
select coalesce(archive, '∅') as archive, count(*)
  from public.candidat group by 1 order by 2 desc;
```

Deux valeurs attendues — `Oui` et `Non` —, et pas de `∅`. Le volet du poste de
travail doit alors annoncer treize dossiers en cours, et non cent sept.

**Les listes de choix, enfin relevées.** Leurs valeurs manquaient au modèle du
4 août ; elles sont dans `docs/specs/2026-08-04-modele-bubble.md`. `ARCHIVER`
est un oui/non — d'où la précaution posée dans `apps/web/src/lib/suivi.ts` :
une valeur qui commence par une négation ne referme rien. Sans elle, les
treize « Non » auraient été comptés comme archivés.

## Compte rendu

Le jour où MAJBUBBLE est passée, noter dans `docs/reprise-bubble-releve.md` :
la date, les comptes obtenus, les écarts constatés et leur explication. Le
relevé du 4 août sert de modèle.
