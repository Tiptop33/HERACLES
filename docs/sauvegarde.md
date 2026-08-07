# La sauvegarde

Depuis que les données de Bubble sont entrées sur le serveur d'essai, la base
porte 107 candidats, leurs parcours, leurs coordonnées et leurs CV. Un disque
perdu, une commande de trop, et il ne reste rien — Bubble, lui, fermera.

## Poser la sauvegarde automatique

Une fois, sur le serveur :

```bash
sudo /opt/heracles-essai-depot/infra/essai/installer-sauvegarde.sh
```

Elle prend une première archive tout de suite, puis chaque nuit à 3 h 20, et
garde les quatorze dernières. `--heure 04:15` et `--garder 30` changent l'un et
l'autre.

Pour en prendre une à la main — avant une opération risquée, avant MAJBUBBLE :

```bash
sudo /opt/heracles-essai-depot/infra/essai/sauvegarder.sh
```

## Ce qu'une archive contient

| | |
| --- | --- |
| `base.sql.gz` | la base de l'application, tous schémas — `public`, `auth`, `storage`, `realtime` |
| `roles.sql.gz` | les rôles PostgreSQL, **sans leurs mots de passe** |
| `stockage.tar.gz` | les fichiers déposés : CV, lettres, photos, PDF |
| `MANIFESTE.txt` | date, version déployée, comptes par table, empreintes SHA-256 |

Le manifeste est ce qui distingue une archive d'un fichier opaque : il dit ce
qu'on doit retrouver après une restauration.

Les rôles sont à part et sans empreintes de mots de passe : une archive qui
circule n'a pas à les porter, et sur une pile déjà installée les rôles existent
déjà — c'est Supabase qui les crée depuis son `.env`. Ce fichier-là est le
filet pour une machine neuve.

**Les secrets n'y sont pas.** Le `.env` de la pile porte le JWT sans lequel les
clés de l'application ne correspondent plus à rien. Il ne change pas d'un jour
à l'autre : il se copie **une fois**, dans un gestionnaire de mots de passe.
`sauvegarder.sh --avec-secrets` le joint, pour cette copie-là uniquement.

## La sortir du serveur

Une archive qui reste sur la machine qu'elle protège n'est pas une sauvegarde.

La copie se **tire** depuis votre poste — le serveur n'a aucun accès chez vous,
et c'est le point : un serveur qui sait écrire chez vous est un serveur qui
peut, le jour où il est pris, effacer chez vous.

```bash
rsync -avz root@<le-serveur>:/var/backups/heracles/ ~/sauvegardes-heracles/
```

À faire tourner sur votre poste, une fois par jour. Sur macOS, `launchd` ; sur
Linux, `cron` ; à défaut, un rappel dans l'agenda vaut mieux que rien.

## Restaurer

Le jour où il faut s'en servir, sur le serveur, archive déjà déposée :

```bash
mkdir /tmp/restauration && tar -xzf heracles-<date>.tar.gz -C /tmp/restauration
cat /tmp/restauration/MANIFESTE.txt        # ce qu'on doit retrouver après
```

**1. Faire taire ce qui écrit.** L'application, puis les services de Supabase
qui touchent à la base : le fichier commence par défaire ce qu'il va refaire,
et il ne peut pas supprimer une table qu'un service est en train de lire.

```bash
docker compose -p heracles-essai-web -f /opt/heracles-essai-depot/infra/docker-compose.prod.yml down
cd /opt/supabase-heracles-essai
docker compose -p heracles-essai stop auth rest storage realtime supavisor studio meta functions imgproxy kong
```

**2. Les rôles**, seulement sur une machine neuve. Sur une pile déjà installée
ils existent : les erreurs « role already exists » sont attendues, et sans
conséquence.

```bash
gunzip -c /tmp/restauration/roles.sql.gz \
  | docker exec -i heracles-essai-db psql -U postgres -d postgres
```

**3. La base.**

```bash
gunzip -c /tmp/restauration/base.sql.gz \
  | docker exec -i heracles-essai-db psql -U postgres -d postgres
```

**4. Les fichiers.**

```bash
rm -rf /opt/supabase-heracles-essai/volumes/storage
tar -xzf /tmp/restauration/stockage.tar.gz -C /opt/supabase-heracles-essai/volumes
```

**5. Tout relancer**, puis rejouer les migrations — elles sont rejouables, et
c'est ce qui remet le cache de l'API d'aplomb :

```bash
sudo /opt/heracles-essai-depot/infra/essai/mettre-a-jour.sh
```

**6. Compter**, et comparer au manifeste. Si les nombres ne correspondent pas,
la restauration n'est pas finie — ne pas rouvrir l'application dessus.

## Ce qui a été éprouvé, et ce qui ne l'a pas été

**Éprouvé le 7 août 2026 :** le tour complet `pg_dump` → base vide →
restauration, sur les migrations 0001 à 0014. Retrouvés à l'identique et sans
une erreur : 14 tables, 13 policies, 59 fonctions, 12 tables sous RLS, et les
données. C'est la partie qui compte : ce qui sort du serveur peut y rentrer.

**Pas encore éprouvé :** la restauration sur une pile Supabase complète, avec
ses conteneurs, ses rôles et son stockage. Une sauvegarde jamais restaurée pour
de bon n'est qu'une hypothèse. La répétition est à faire sur une machine
jetable avant la bascule du 5 décembre — pas le jour où le serveur brûle.

## Ces archives sont des données personnelles

Une archive, c'est la base entière : des parcours, des adresses, des
téléphones, des CV de personnes en recherche d'emploi. Elle se traite comme la
base elle-même.

- lisible par `root` seul (`chmod 600`), dans `/var/backups/heracles` en `700` ;
- jamais dans le dépôt, jamais sur un partage ouvert, jamais dans une pièce
  jointe ;
- sur votre poste, dans un dossier chiffré — c'est là qu'elles seront le plus
  longtemps ;
- quatorze jours de conservation par défaut : ce qui suffit à rattraper une
  bêtise, sans accumuler des copies de données personnelles pendant des mois.
