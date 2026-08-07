# Mettre HERACLES en ligne sur le VPS

- **Date :** 2026-08-05
- **Cible :** le VPS qui héberge déjà MyCollabus. Rien ne doit se croiser.
- **Ce document ne contient aucun secret**, et n'en contiendra jamais. Ils se
  fabriquent sur le VPS et n'en sortent pas.

> **Avant de commencer, trois choses doivent être décidées ou obtenues.** Sans
> elles, la mise en ligne s'arrête à mi-chemin :
>
> 1. **Le nom de domaine.** Point ouvert n° 3 du cadrage, toujours ouvert. Il
>    faut le connaître *avant* de construire l'image : `NEXT_PUBLIC_APP_URL` est
>    figée à la construction, pas au démarrage, et sert à fabriquer les liens
>    des emails.
> 2. **Un SMTP transactionnel.** Depuis que l'on n'entre qu'invité, aucun email
>    veut dire aucune entrée possible. Ce n'est plus un confort.
> 3. **Qui sera le premier administrateur.** Personne ne peut l'inviter : il se
>    crée à la main, une seule fois (§ 5).

Deux noms sont supposés dans tout ce document — à remplacer partout :

| | |
| --- | --- |
| `heracles.example.fr` | l'application web |
| `api.heracles.example.fr` | l'API Supabase |


## L'instance d'essai — à faire avant la vraie

Avant d'approcher les 107 dossiers réels, il vaut mieux voir l'application
vivre en conditions réelles : vrai HTTPS, vrais emails, vrais navigateurs, sur
une base vide.

Le dépôt s'obtient sur le VPS par un **clone**, jamais par une copie déposée
là. Une copie ne sait pas d'où elle vient : `git pull` y répond « not a git
repository », on croit avoir la dernière version et on tourne sur l'ancienne —
avec des messages d'erreur qui décrivent un code qui n'est plus.

```bash
git clone -b <branche> https://github.com/Tiptop33/HERACLES.git /root/HERACLES
cd /root/HERACLES
```

Une seule commande monte ensuite l'instance :

```bash
sudo ./infra/essai/deployer.sh essai.mondomaine.fr api-essai.mondomaine.fr
```

Elle clone la pile officielle, **fabrique les secrets sur place** — y compris
les deux JWT `anon` et `service_role`, signés localement plutôt que par un
générateur en ligne —, joue les migrations, construit l'application, écrit la
configuration Nginx, et vous dit ce qu'il reste à faire à la main : le
certificat et le premier administrateur.

Elle est rejouable : relancée, elle complète ce qui manque sans rien casser, et
ne régénère jamais des secrets déjà posés.

**Elle s'arrête si `SMTP_HOST` est vide.** C'est délibéré : sans email, aucune
invitation ne part, donc personne ne peut entrer — l'instance serait inutile.

### Le courrier, et le piège Gmail

`SMTP_PASS` n'est **pas** le mot de passe du compte Google. Il faut un *mot de
passe d'application* — seize caractères, créés sur
[myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords),
et qui n'existent que si la validation en deux étapes est activée. Le mot de
passe du compte donne :

```
535 5.7.8 Username and Password not accepted
```

La connexion s'établit, seule l'authentification échoue — d'où la confusion
avec un port bloqué, qui n'a pas la même signature. Google affiche le mot de
passe par groupes de quatre : les espaces ne font pas partie du secret.

Ce n'est visible nulle part ailleurs que dans le journal du service : côté
application, une invitation qui ne part pas ne dit rien de plus que « l'e-mail
n'a pas pu partir ».

```bash
docker logs --tail 100 heracles-essai-auth 2>&1 | grep -i smtp
```

### La façade : Nginx, ou celle qui est déjà là

Un seul serveur peut tenir le port 80. Le script regarde qui l'occupe :

- **personne, ou Nginx** → il écrit la configuration Nginx et guide vers
  certbot ;
- **Traefik** → il ne touche à rien chez lui. Traefik découvre les services
  par les **étiquettes de leurs conteneurs** : le script les pose sur Kong et
  sur l'application, et Traefik va chercher le certificat tout seul. Modifier
  sa configuration à lui reviendrait à toucher aux autres sites du VPS.
- **autre chose** → il s'arrête et le nomme, plutôt que de deviner.

Le nom du résolveur de certificats de Traefik est supposé `letsencrypt`. S'il
diffère : `HERACLES_CERTRESOLVER=<nom> sudo -E ./infra/essai/deployer.sh …`

Si le `.env` date d'une version antérieure du script et qu'il manque des
variables que la pile attend — le symptôme est un service qui redémarre sans
fin, avec `converting '' to type bool` dans son journal —, on repart de zéro :

```bash
sudo ./infra/essai/deployer.sh --repartir-de-zero essai.mondomaine.fr api-essai.mondomaine.fr
```

**Cette option efface la base de l'essai** : conteneurs arrêtés, volumes
supprimés, secrets refaits. Elle ne garde que les réglages SMTP, les seuls que
le script ne sache pas refabriquer. Ne jamais l'employer en production.

Elle **refuse de s'exécuter** si la base contient des candidats, et dit alors
comment sauvegarder. Une instance d'essai naît vide ; le jour où elle ne l'est
plus, effacer n'est plus anodin, et un avertissement en commentaire n'aurait
protégé personne.

### Faire entrer les données de Bubble

```bash
sudo ./infra/essai/reprendre-bubble.sh              # les données
sudo ./infra/essai/reprendre-bubble.sh --fichiers   # et les CV, lettres, photos
```

Deux passes, comme la reprise du 4 août : les tables métier depuis la base **en
service**, les référentiels depuis celle de **l'éditeur** — les deux bases de
Bubble n'exposent pas les mêmes types. Rejouable : une fiche déjà reprise est
mise à jour, jamais dupliquée.

Les outils tournent **dans un conteneur**, pas sur la machine : le VPS n'a pas
forcément `npm`, sa version de Node est ce qu'elle est, et depuis le réseau de
la pile la base se joint par son nom — `db` — sans deviner d'adresse ni publier
de port. PostgreSQL reste inaccessible de l'extérieur, et ça ne change pas.

**Ce que cela fait entrer sur le serveur** : 107 candidats avec leurs
coordonnées, leurs parcours et leurs CV, 71 référents, 4 539 offres. Trois
choses en découlent, et il vaut mieux les décider avant que les subir :

- la **sauvegarde** devient une obligation, et elle doit sortir du VPS — une
  sauvegarde qui reste sur la machine qu'elle protège n'en est pas une ;
- `--repartir-de-zero` refusera désormais de s'exécuter, ce qui est bien ;
- l'**API Bubble** répond toujours sans jeton (voir
  `docs/reprise-bubble-releve.md`). Les mêmes données sont maintenant à deux
  endroits ; il n'y a plus de raison de laisser la première ouverte.

Les fichiers sont l'étape à ne pas manquer : CV, lettres et photos vivent sur
le CDN de Bubble et **cesseront de répondre à la fermeture de l'application**.
`--fichiers` les rapatrie dans le stockage Supabase, et il est reprenable —
interrompu, relancé, il repart où il en était.

### Rien ne se croise

| | Essai | Production | MyCollabus |
| --- | --- | --- | --- |
| Dossier | `/opt/supabase-heracles-essai` | `/opt/supabase-heracles` | `/opt/supabase` |
| Projet Docker | `heracles-essai` | `heracles-supabase` | `mycollabus-prod` |
| Conteneurs | `heracles-essai-*` | `heracles-*` | `supabase-*` |
| Kong | `127.0.0.1:8101` | `127.0.0.1:8100` | `127.0.0.1:8000` |
| Application | `127.0.0.1:3003` | `127.0.0.1:3002` | `127.0.0.1:3001` |
| Volume de la base | `heracles-essai_db-config` | `heracles-supabase_db-config` | `mycollabus-prod_db-config` |

La base s'appelle `postgres` dans les trois cas, et ce n'est pas un oubli :
Supabase installe son socle — schéma `auth`, rôles, extensions — dans la base
par défaut. Une base renommée naît vide, et le rôle `postgres` n'y a même pas
les droits sur le schéma `public`. L'isolation ne vient pas du nom de la base
mais du conteneur et du volume, qui ne se croisent jamais.

Ce cloisonnement a été éprouvé : la même surcharge, avec deux jeux de
variables, produit deux piles qui ne partagent ni un nom de conteneur ni un
port. Le seul port publié, dans les deux cas, est celui de Kong — et toujours
sur `127.0.0.1`, jamais sur l'adresse publique.


### Déployer sans toucher au serveur

Une fois l'installation initiale faite, les mises à jour passent par GitHub
Actions : [`.github/workflows/deployer-essai.yml`](../.github/workflows/deployer-essai.yml).

Le workflow **ne déploie rien qui n'ait passé** lint, tests unitaires,
construction, et toute la suite SQL — contrôles de RLS compris. Une règle
d'accès cassée n'atteint pas le serveur.

Tout le nécessaire côté serveur tient en une commande, à lancer une fois,
depuis le dépôt qui a servi à l'installation :

```bash
sudo ./infra/essai/preparer-deploiement.sh essai.mondomaine.fr
```

Elle affiche à la fin les quatre secrets à coller dans *Réglages → Secrets and
variables → Actions* :

| Secret | Ce que c'est |
| --- | --- |
| `VPS_HOTE` | l'adresse du serveur |
| `VPS_UTILISATEUR` | le compte dédié au déploiement — surtout pas `root` |
| `VPS_CLE_SSH` | la clé privée de ce compte, et de lui seul |
| `VPS_EMPREINTE` | la ligne `known_hosts` du serveur |

`VPS_EMPREINTE` n'est pas un détail : sans elle, la première connexion accepte
n'importe quel serveur qui répond à ce nom.

#### Pourquoi ce montage-là

**Le serveur ne reçoit pas de fichiers, il va les chercher.** GitHub ouvre une
connexion, rien de plus ; c'est le serveur qui récupère `main` depuis le dépôt.
Ce qui tourne vient donc de GitHub, et non de ce qu'une machine de
construction avait sous la main.

**La clé ne sait faire qu'un geste.** Dans `authorized_keys`, `restrict` retire
le terminal, les redirections de port, l'agent, X11 ; `command=` impose le
déploiement et ignore ce que le client demande. Si cette clé fuit, elle ne
donne pas le serveur : elle donne le droit de redéployer HERACLES.

**Le lanceur appartient à `root`, hors du dépôt.** C'est le point qui a fait
réécrire ce montage : donner à un compte le droit de déposer des fichiers *et*
celui de lancer en `sudo` un script qui se trouve parmi ces fichiers, c'est lui
donner `root`. Il suffirait de réécrire le script. Ici, le compte de
déploiement ne peut écrire ni dans `/opt/heracles-essai-depot`, ni dans
`/usr/local/sbin`.

La règle `sudo` posée est donc :

```
deploiement-heracles ALL=(root) NOPASSWD: /usr/local/sbin/heracles-essai-deployer
```

Cela s'éprouve sans attendre GitHub : la première commande doit dérouler le
déploiement, la seconde être refusée.

```bash
ssh -i <la-cle> deploiement-heracles@essai.mondomaine.fr
ssh -i <la-cle> deploiement-heracles@essai.mondomaine.fr 'cat /etc/shadow'
```

Le même script se lance à la main le jour où le workflow ne suffit pas :

```bash
sudo /opt/heracles-essai-depot/infra/essai/mettre-a-jour.sh
```

Il rejoue toutes les migrations — elles sont idempotentes par construction —
puis reconstruit l'application, et **s'arrête avant de reconstruire** si une
migration échoue : l'instance continue alors de tourner sur l'ancienne version
plutôt que sur une base à moitié migrée.

### Quand l'essai a fait son office

`docker compose -p heracles-essai down -v` la démonte, volumes compris. Ne le
faites qu'une fois la production en place et vérifiée.

## 0. Ce qui est réservé à HERACLES

Rien ici ne doit croiser MyCollabus. Ces valeurs viennent du cadrage, § 8.

| | HERACLES |
| --- | --- |
| Dossier de la pile Supabase | `/opt/supabase-heracles` |
| Projet Docker (pile) | `heracles-supabase` |
| Projet Docker (web) | `heracles-prod` |
| Conteneurs | préfixés `heracles-` |
| Kong | `127.0.0.1:8100` |
| Application web | `127.0.0.1:3002` |
| PostgreSQL | **non publié** — réseau Docker seul |
| Studio | **non publié** — tunnel SSH seul |

## 1. La pile Supabase

On clone la pile officielle telle quelle, et on la surcharge : une copie
divergerait en silence à la première mise à jour.

```bash
sudo mkdir -p /opt/supabase-heracles && cd /opt/supabase-heracles
git clone --depth 1 https://github.com/supabase/supabase tmp
cp -r tmp/docker/* . && cp tmp/docker/.env.example .env.supabase-origine
rm -rf tmp
```

Puis, depuis une copie du dépôt HERACLES :

```bash
umask 077
infra/supabase/composer-env.sh \
  /opt/supabase-heracles/.env.supabase-origine \
  heracles.example.fr api.heracles.example.fr heracles \
  > /opt/supabase-heracles/.env

node infra/supabase/composer-surcharge.mjs \
  /opt/supabase-heracles/docker-compose.yml heracles 8100 \
  > /opt/supabase-heracles/docker-compose.override.yml
```

Ni l'un ni l'autre n'est recopié d'un modèle à nous : les deux sont
**calculés** à partir de la pile réellement clonée.

- La **surcharge** parce que la liste des services de Supabase change d'une
  version à l'autre, et qu'en nommer un qui n'existe pas fait échouer tout le
  démarrage.
- Le **`.env`** parce que la composition lit une trentaine de variables, que la
  liste bouge elle aussi, et qu'une variable absente du fichier n'arrive pas
  absente mais **vide**. Un booléen vide fait tomber le service qui l'attend
  (`converting '' to type bool`) : sans service d'authentification, pas de
  schéma `auth` ; sans schéma `auth`, aucune migration. Une variable oubliée
  arrête donc toute l'installation, très loin de sa cause.

`composer-env.sh` fabrique tous les secrets sur place — `openssl` pour les
mots de passe et les clés de chiffrement, Node pour signer `ANON_KEY` et
`SERVICE_ROLE_KEY` avec `JWT_SECRET`. Le générateur en ligne de Supabase n'est
pas employé : on ne confie pas un secret à une page web. Aucune valeur par
défaut du modèle ne survit — il est publié sur GitHub, ses mots de passe et
ses clés S3 le sont donc aussi.

Reste une chose à renseigner à la main dans `/opt/supabase-heracles/.env` :
`SMTP_HOST`, `SMTP_USER` et `SMTP_PASS`. Ils sont laissés vides exprès. Sans
SMTP aucune invitation ne part, et depuis que l'inscription libre est fermée,
personne ne peut plus entrer.

```bash
cd /opt/supabase-heracles
docker compose -p heracles-supabase up -d
docker ps --format '{{.Names}}' | grep heracles-   # tous préfixés, sinon la surcharge n'est pas prise
```

**Vérifiez tout de suite que rien ne dépasse :**

```bash
ss -lntp | grep -E '5432|8000|3000'    # ne doit RIEN montrer d'écoutant sur 0.0.0.0
ss -lntp | grep 8100                   # doit montrer 127.0.0.1 seulement
```

## 2. Les migrations

Elles se jouent dans l'ordre, une seule fois, en une transaction chacune.

```bash
cd /opt/supabase-heracles
for f in /chemin/vers/HERACLES/supabase/migrations/*.sql; do
  echo "→ $(basename "$f")"
  docker exec -i heracles-db psql -U postgres -d heracles -v ON_ERROR_STOP=1 \
    --single-transaction < "$f" || break
done
```

`--single-transaction` compte : une migration qui échoue à mi-chemin ne laisse
pas la base entre deux états.

Puis on recharge le cache de l'API, sans quoi les nouvelles fonctions lui
restent invisibles :

```bash
docker exec -i heracles-db psql -U postgres -d heracles -c "notify pgrst, 'reload schema';"
```

## 3. L'application web

```bash
cd /chemin/vers/HERACLES
cp .env.example .env      # puis renseigner
docker compose -f infra/docker-compose.prod.yml -p heracles-prod up -d --build
```

`.env` doit porter cinq valeurs, et `WEB_PORT` :

| | |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://api.heracles.example.fr` |
| `NEXT_PUBLIC_APP_URL` | `https://heracles.example.fr` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | la clé `anon` |
| `SUPABASE_SERVICE_ROLE_KEY` | la clé `service_role` |
| `WEB_PORT` | `3002` en production, `3003` à l'essai |

**`SUPABASE_SERVICE_ROLE_KEY` n'est pas facultative.** Deux routes en ont
besoin — l'historique des mots de passe et l'émission des invitations. Sans
elle, tout paraît fonctionner jusqu'à ce que quelqu'un choisisse son mot de
passe : l'écran annonce alors une panne de réseau, parce qu'une route qui lève
renvoie du HTML là où le navigateur attend du JSON. Elle reste une variable
d'exécution, jamais un argument de construction : un argument finirait dans
l'image.

**`NEXT_PUBLIC_*` est figée à la construction.** Changer le domaine plus tard
oblige à reconstruire l'image — pas seulement à redémarrer le conteneur.

## 4. Nginx et HTTPS

**L'ordre compte, et il n'est pas celui qu'on croit.** La configuration réclame
un certificat ; tant qu'il n'existe pas, `nginx -t` échoue, donc tout
rechargement, donc certbot lui-même. La configuration qui attend le certificat
empêche de l'obtenir.

On sert donc d'abord les deux noms en clair, le temps de la vérification — et
rien de plus qu'elle : un mot de passe ne doit pas voyager à découvert.

```bash
sudo mkdir -p /var/www/html
sudo tee /etc/nginx/sites-available/heracles >/dev/null <<'FIN'
server {
    listen 80;
    listen [::]:80;
    server_name heracles.example.fr api.heracles.example.fr;

    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 503; }
}
FIN
sudo ln -s /etc/nginx/sites-available/heracles /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

sudo certbot certonly --webroot -w /var/www/html \
  -d heracles.example.fr -d api.heracles.example.fr
```

Le certificat obtenu, on pose la vraie configuration :

```bash
sudo cp infra/nginx/heracles.conf.example /etc/nginx/sites-available/heracles
sudo nano /etc/nginx/sites-available/heracles          # remplacer les deux noms
sudo nginx -t && sudo systemctl reload nginx
```

`certbot --nginx` ferait le premier pas tout seul, mais réécrirait la
configuration à sa façon : on y perdrait les en-têtes de sécurité et le refus
d'exposer Studio. `certonly` obtient le certificat sans toucher à rien.

## 5. Le premier administrateur

Personne ne peut l'inviter. On l'ouvre une fois, à la main :

```bash
HERACLES_API_URL=https://api.heracles.example.fr \
HERACLES_APP_URL=https://heracles.example.fr \
SUPABASE_SERVICE_ROLE_KEY=<la clé service_role> \
  node outils/premier-admin.mjs vous@exemple.fr --confirmer
```

Aucun mot de passe ne circule : un lien part, et la personne choisit le sien.
Elle pourra ensuite inviter tous les autres.

## 6. Ce qu'il faut vérifier avant d'annoncer quoi que ce soit

```bash
# L'API répond, et refuse ce qu'elle doit refuser
curl -s -o /dev/null -w '%{http_code}\n' https://api.heracles.example.fr/rest/v1/
curl -s https://api.heracles.example.fr/rest/v1/candidat   # doit répondre « permission denied »

# L'application répond
curl -s -o /dev/null -w '%{http_code}\n' https://heracles.example.fr/connexion
```

Puis, à la main :

- se connecter avec le compte administrateur ;
- inviter quelqu'un, vérifier que l'email arrive **vraiment** ;
- ouvrir le lien, accepter, choisir un mot de passe, arriver dans son espace ;
- se connecter avec deux référents différents et vérifier qu'aucun ne voit les
  candidats de l'autre — recopier l'adresse d'une fiche de l'un dans le
  navigateur de l'autre doit donner une page introuvable.

## 7. Sauvegardes — avant les vraies données, pas après

```bash
docker exec heracles-db pg_dump -U postgres heracles | gzip > /var/backups/heracles-$(date +%F).sql.gz
```

À mettre dans une tâche planifiée quotidienne, avec copie **hors du VPS**. Une
sauvegarde qui vit sur la machine qu'elle protège ne protège de rien.

## Ce que ce document ne couvre pas encore

- **Le rapatriement des fichiers** depuis Bubble (`outils/rapatrier-fichiers.mjs`),
  à faire avant la bascule : les CV et photos vivent encore sur leur CDN.
- **La reprise des données** de production — l'import Bubble a été éprouvé en
  local, pas encore joué sur le VPS.
- **La double authentification** des administrateurs (écran 4 de la maquette) :
  elle demande un fournisseur de SMS, à choisir.
- **La connexion par Google** : identifiants OAuth à créer, puis à déclarer.
