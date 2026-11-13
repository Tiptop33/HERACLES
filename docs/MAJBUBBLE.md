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
| **Un jeton** | `BUBBLE_TOKEN=xxx sudo -E …` — l'API répond aussi sans, mais c'est à éviter. **Un jeton refusé donne `HTTP 401` et arrête tout** : les réglages d'API de Bubble sont versionnés, un jeton créé dans l'éditeur n'existe côté application en service qu'une fois celle-ci déployée. La reprise le vérifie avant d'écrire quoi que ce soit, et le dit. Relancer sans `BUBBLE_TOKEN` débloque — au prix de laisser la porte ouverte le temps de l'opération. |
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

**Vérifier les secteurs repris.** La commande applique aux fiches la
correspondance des secteurs Bubble (migration 0093, passe 6) : le code NAF
de Bubble d'office, la liste ROME et le texte libre selon ce que
l'administration a validé dans **Paramètres › Secteurs d'activité**. Une ligne
encore « à valider » le jour de MAJBUBBLE laisse ses fiches sans secteur : les
valider **avant**, ou juste après — l'écran applique aussitôt, sans attendre une
reprise. Les champs Bubble restent en place après la fermeture : la
correspondance continue de s'appliquer à chaque validation.

```sql
select count(*) as secteurs_a_valider
  from public.secteurs_bubble_des_fiches() f
  left join public.secteur_bubble sb on sb.source = f.source and sb.valeur = f.valeur
 where sb.valide_le is null;
```

**Les loges du réseau.** La commande les pose aussi (passe 7, migration 0094) :
les 73 loges que Bubble rattache à la loge HERACLES, dans Paramètres › Loges
du réseau. Rien de ce que l'administration a saisi n'est remplacé ; une loge
qu'elle a retirée ne revient pas. Leurs écussons partent avec `--fichiers`, ou
seuls avec `--loges-du-reseau`. Les adresses des logos, comme toutes celles du
CDN de Bubble, cesseront de répondre à la fermeture : vérifier qu'aucun
écusson ne reste à rapatrier.

```sql
select count(*) as ecussons_a_rapatrier from public.loge_du_reseau
 where ecusson_url is not null and ecusson_chemin is null;
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

**Retirer les reprises de la mise en ligne.** Jusqu'à la bascule,
`mettre-a-jour.sh` rapatrie à chaque déploiement les comptes rendus, affiches et
affichettes de Bubble (`reprendre-bubble.sh --pdf-commission`, voir
[`mise-en-page.md`](mise-en-page.md)), et recopie la date de dernière
modification de chaque candidat (`--dates-candidats`, migration 0071). Une fois
Bubble fermé, ces deux étapes ne font plus qu'échouer sans bloquer : les
enlever du script.

**Une clôture ou un archivage faits dans HERACLES survivent à MAJBUBBLE.**
La reprise recopie CLOTURE et ARCHIVER sur les dossiers venus de Bubble ; un
déclencheur (migration 0071) l'empêche de rouvrir un dossier qu'HERACLES a
clôturé ou archivé entre-temps — et, depuis la migration 0072, de refermer un
dossier qu'HERACLES a rouvert alors que Bubble le tient encore pour clôturé.
Le reste de ce qu'HERACLES a changé sur ces fiches est, lui, remplacé par les
valeurs de Bubble, comme avant.

## Les numéros des candidats

Dans une même loge, deux dossiers ne portent jamais le même numéro : la base le refuse
(migration `0084`). Or Bubble numérote encore de son côté jusqu'à la bascule. Un de ses
candidats prendra donc tôt ou tard un numéro déjà porté par un dossier ouvert dans HERACLES.

**Bubble garde son numéro.** La reprise suspend la règle le temps d'écrire, puis la rétablit :
le dossier venu de Bubble garde son numéro, celui ouvert dans HERACLES est renuméroté à la
suite de sa loge. Elle l'annonce :

```
Numéros des candidats :
  1 dossier(s) ouvert(s) dans HERACLES renuméroté(s) : Bubble garde son numéro
```

Un dossier renuméroté a changé de numéro sur tout ce qui se produira ensuite — compte rendu,
affiche, affichette, CV anonyme. Ce qui a déjà été imprimé porte l'ancien.

Un seul cas ne se règle pas tout seul : **deux dossiers de Bubble lui-même** sous le même
numéro dans la même loge. On ne corrige pas Bubble, et rien ne dit lequel renuméroter. La
reprise continue, mais l'unicité n'est pas posée, et elle le dit :

```
  ! 1 numéro(s) porté(s) deux fois dans une même loge PAR BUBBLE LUI-MÊME.
```

Pour les trouver — des numéros et des noms de loge, aucune fiche :

```bash
docker exec -i <prefixe>-db psql -U postgres -d postgres -c "
select l.nom, c.numero, count(*) as dossiers
  from public.candidat c join public.loge l on l.id = c.loge_id
 where c.numero is not null
 group by l.nom, c.numero having count(*) > 1
 order by l.nom, c.numero;"
```

Une fois le doublon levé, l'unicité revient d'elle-même : au déploiement suivant, ou à la
reprise suivante. Après la bascule, Bubble est fermé et la question ne se pose plus — il n'y
a plus qu'une seule suite de numéros.

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

**Les référents choisis dans HERACLES.** Un candidat dont le référent a été
choisi ou changé dans HERACLES (`referent_choisi_le`, migration 0063) garde ce
référent : la reprise ne le remplace plus par celui de Bubble. Tous les autres
suivent Bubble, comme avant. Si une décision de la commission n'a été reportée
que dans Bubble après qu'un choix a été fait ici, il faut la reporter aussi
dans HERACLES.

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

### Les réunions — même piège, découvert plus tard

`reunion` est dans le même cas que `tache` : pas de table à lui dans le PLAN de
`import-bubble.mjs`, donc il arrive en JSON dans `bubble_brut` par la passe de
la réserve brute. `0036_reunions_et_appels.sql` le déplie en réunions **et en
pointages** — la liste `referent` du JSON donne les présents, `EXCUSE` les
excusés ; ce que Bubble ne dit pas, on ne l'invente pas, et les absents se
déduisent de l'effectif.

```sql
select * from public.deverser_reunions_bubble();
```

**Ce déversement manquait au script jusqu'au 9 août 2026.** La fonction
existait depuis 0036, mais rien ne l'appelait : `reprendre-bubble.sh` déversait
les tâches et s'arrêtait là. Une reprise complète aurait donc rempli
`bubble_brut` sans jamais garnir le registre — les réunions et toute
l'assiduité perdues en silence, sans message d'erreur, le jour de la bascule.
C'est corrigé, et le récapitulatif de fin de script compte désormais `reunion`
et `appel` : un zéro s'y verrait.

#### `reunion` n'existe que sur la base de l'éditeur

Relevé du 10 août 2026, en interrogeant les deux bases à découvert :

| Base | `/obj/reunion` | Types exposés |
| --- | --- | ---: |
| en service | `404 — Type not found reunion` | 7 |
| éditeur (`version-test`) | **24 réunions** | 45 |

Les sept types exposés en service sont exactement ceux du PLAN. **Tout le
reste — `reunion`, `tache`, et trente-six autres — n'existe que côté
éditeur.**

*Ce qu'il faut faire avant la bascule*, et c'est le même geste que pour
`tache` : exposer `reunion` sur la base **en service** (Data → Data types,
« expose via API », puis **déployer** — le réglage est versionné). L'éditeur
tient ces données à jour aujourd'hui, mais rien ne le garantit d'ici décembre,
et c'est la base en service qui fait foi le jour de la fermeture.

#### Une reprise peut s'arrêter en route sans le dire

Le 8 août, la reprise n'a stocké que **7 réunions sur 24**. Aucune n'avait été
créée depuis — elles vont de septembre 2025 à juillet 2026 —, donc elles
étaient toutes là au moment du passage. La reprise s'est interrompue au milieu
de ce type.

Personne ne l'a vu, et c'est le vrai enseignement : `import-bubble.mjs` attrape
les erreurs **type par type** et poursuit avec le suivant. Un type à moitié
repris ne fait donc échouer ni la passe, ni le script, qui se termine en vert.

D'où le contrôle à faire après chaque reprise, avant de conclure quoi que ce
soit :

```sql
select type_bubble, count(*), max(recupere_le)::date
  from public.bubble_brut group by 1 order by 2 desc;
```

Et à comparer avec ce que Bubble annonce, base par base :

```bash
curl -s "https://heracles-42268.bubbleapps.io/version-test/api/1.1/obj/<type>?limit=1" \
  | python3 -c "import sys,json; r=json.load(sys.stdin)['response']; print(r['count']+r['remaining'])"
```

#### Le jeton n'est pas nécessaire, et nuit quand il est faux

L'API des deux bases répond **sans aucune authentification** — c'est le défaut
de sécurité connu, et il joue ici en notre faveur. Un `401` lors d'une reprise
ne signifie donc jamais « accès manquant » : il signifie qu'un `BUBBLE_TOKEN`
a été fourni et refusé. Dans ce cas, **retirer la variable** suffit :

```bash
sudo /opt/heracles-essai-depot/infra/essai/reprendre-bubble.sh   # sans BUBBLE_TOKEN
```

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

### Les provinces — un jeton obligatoire

Relevé du 11 novembre 2026 (`/api/1.1/meta`, les deux bases) :

| | |
| --- | --- |
| Nom du type | **`provinces`**, au pluriel — l'affichage dit « PROVINCES » |
| Champs | `Nom` (texte), `Ecusson` (image), `LOGES-OAF` (liste de loges), `Slug`, et les champs système |
| Exposé | par **les deux bases** — la base en service expose désormais 45 types, et non plus 7 |
| Enregistrements | **deux**, désignés par les trois loges de la base en service |
| Sans jeton | la liste répond **vide** ; une fiche lue par son identifiant ne rend **que son `_id`** |

Ce dernier point est une règle de confidentialité de Bubble sur le type. Elle
ne gêne pas l'application : elle gêne la reprise, qui sans jeton n'obtient que
des identifiants. **La reprise des provinces se fait donc avec
`BUBBLE_TOKEN`**, et une option la fait seule :

```bash
BUBBLE_TOKEN=xxx sudo -E /opt/heracles-essai-depot/infra/essai/reprendre-bubble.sh --provinces
```

Elle recopie le type `provinces` dans `bubble_brut` — lui seul —, le déplie
dans la table `provinces` (`deverser_provinces_bubble()`, migrations 0080,
0081 et 0096), rattache chaque loge à sa province, rapatrie les écussons dans le
stockage, et finit par un bilan chiffré. Sans jeton, elle refuse de tourner
(code 3).

**Rejouée à chaque mise en ligne**, comme les PDF de la commission, dès que
le jeton est rangé sur le serveur — une ligne dans le `.env` de la pile :

```bash
sudo nano /opt/supabase-heracles-essai/.env     # ajouter : BUBBLE_TOKEN=xxx
```

`mettre-a-jour.sh` la lance alors après chaque déploiement, non bloquante et
bornée à trois minutes. Sans la ligne, il le dit d'une phrase et passe. Une
réinstallation (`deployer.sh --repartir-de-zero`) garde le jeton, comme les
réglages SMTP. Les reprises des PDF et des dates tournent, elles, **sans** le
jeton (`env -u BUBBLE_TOKEN`), bien que `mettre-a-jour.sh` charge tout le
`.env` : un jeton que la base en service ne reconnaît pas les ferait échouer.

**Si la base en service refuse le jeton.** Les réglages d'API de Bubble sont
versionnés : un jeton créé dans l'éditeur n'est reconnu par la base en service
qu'une fois Bubble déployé en Live. Déployer Bubble pousserait aussi en Live
tout ce qui attend dans l'éditeur ; décision du 12 novembre 2026 : on ne le
fait pas pour deux fiches. La reprise lit alors les provinces dans la **base
de test** (`version-test`), où le jeton vaut tout de suite — mêmes provinces,
mêmes identifiants, puisque les loges en service les désignent. Le bilan le
dit, sur une ligne au-dessus du tableau :

```
Lues dans : base de test (version-test) — repli, jeton refusé par la base en service
```

Le nom ou l'écusson peuvent y différer de ceux en service : les comparer à
l'écran Province avant la bascule, et corriger dans HERACLES ce qui doit
l'être — la correction tient (voir ci-dessous). Le jour où la base en service accepte le
jeton, c'est elle qui fait foi, sans rien changer. Si la base de test le
refuse aussi, la mise en ligne affiche « le jeton Bubble est refusé, même par
la base de test » : il a été mal recopié, ou régénéré depuis.

Ce que ce jeton est, et ce qu'il faut en faire :

- c'est un jeton d'**administration** de l'API Bubble — lecture et écriture
  sur toute l'application, pas seulement les provinces. Il ne sert qu'à la
  reprise des provinces : les PDF et les dates continuent sans lui ;
- il ne s'affiche nulle part — ni dans la sortie des scripts, ni dans les
  journaux GitHub du déploiement, où la reprise dit seulement « avec jeton » ;
- il voyage avec le `.env` dans les **sauvegardes** (`docs/sauvegarde.md`),
  donc jusqu'au poste qui les tire ;
- **le jour de la bascule**, après la reprise finale : retirer la ligne du
  `.env`, et révoquer le jeton dans l'éditeur Bubble (Settings → API). Une
  fois Bubble fermé il ne sert plus à rien, mais un jeton oublié reste une
  porte.

Deux défauts de 0080, corrigés par 0081 avant toute reprise réelle :

- 0080 cherchait le type `province`, au singulier : le dépliage n'aurait rien
  trouvé, et l'aurait dit par un `deversees = 0` qu'on pouvait lire comme
  « rien de neuf » ;
- une reprise complète lancée **sans** jeton recopie des provinces réduites à
  leur `_id`, et le dépliage effaçait alors le nom et l'écusson déjà connus.
  Désormais, ce que Bubble ne dit pas n'efface pas ce qu'on sait.

**HERACLES fait foi (migration 0096, 13 novembre 2026).** L'administration
tient les provinces depuis l'écran Province : elle en ajoute, les renomme,
dépose leur écusson, en retire. La reprise, rejouée à chaque mise en ligne, ne
défait rien de tout cela :

- une province absente de HERACLES est créée ;
- une province présente n'est que **complétée** : un nom ou une adresse
  d'écusson encore vides sont remplis, rien de connu n'est remplacé — ni un
  nom corrigé, ni un écusson déposé ;
- une province **retirée** par l'administration ne revient pas : chaque
  province Bubble prise une fois est notée dans `provinces_bubble` ;
- une province saisie à la main sous le même nom que celle de Bubble lui est
  rattachée, au lieu d'être doublée.

Table et champs portent leurs noms depuis le même jour : `provinces`,
`nom_de_la_province`, `ecusson_provincial` (le chemin dans le stockage) et
`ecusson_provincial_url` (l'adresse d'origine chez Bubble). Une base qui avait
l'ancienne table `province` est renommée au premier déploiement, sans perte
(en-tête de la migration 0080).

**À vérifier après chaque reprise des provinces**, sur le bilan :

- la ligne « Lues dans » : base en service, ou base de test en repli ;
- `provinces` = 2, `avec_nom` = 2, `avec_ecusson` = 2 — moins les provinces
  que l'administration a retirées, comptées à part
  (`retirees_par_l_administration`) ;
- `ecusson_dans_le_stockage` = 2 — sinon relancer : le rapatriement reprend
  où il s'est arrêté ;
- `loges_rattachees` = le nombre de loges reprises.

Un `avec_nom` inférieur à `provinces` veut dire que le jeton n'a pas été pris
— ou que Bubble a renommé un champ. Les clés se lisent ainsi, les clés seules :

```sql
select distinct jsonb_object_keys(donnees) from public.bubble_brut
 where type_bubble = 'provinces';
```

Une carte dont l'écusson n'est pas encore dans notre stockage montre
l'initiale de la province à sa place, comme l'annuaire le fait pour un
référent sans photo.

## Compte rendu

Le jour où MAJBUBBLE est passée, noter dans `docs/reprise-bubble-releve.md` :
la date, les comptes obtenus, les écarts constatés et leur explication. Le
relevé du 4 août sert de modèle.
