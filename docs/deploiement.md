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
cp infra/supabase/docker-compose.override.yml /opt/supabase-heracles/
cp infra/supabase/.env.example /opt/supabase-heracles/.env
```

Renseignez `/opt/supabase-heracles/.env`. Les secrets se fabriquent sur place :

```bash
openssl rand -hex 32      # POSTGRES_PASSWORD, JWT_SECRET, SECRET_KEY_BASE, VAULT_ENC_KEY
```

`ANON_KEY` et `SERVICE_ROLE_KEY` sont des JWT signés avec `JWT_SECRET` —
[le générateur de Supabase](https://supabase.com/docs/guides/self-hosting#api-keys)
les produit.

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

`.env` doit porter `NEXT_PUBLIC_SUPABASE_URL=https://api.heracles.example.fr`,
`NEXT_PUBLIC_APP_URL=https://heracles.example.fr` et la clé `anon`.

**`NEXT_PUBLIC_*` est figée à la construction.** Changer le domaine plus tard
oblige à reconstruire l'image — pas seulement à redémarrer le conteneur.

## 4. Nginx et HTTPS

```bash
sudo cp infra/nginx/heracles.conf.example /etc/nginx/sites-available/heracles
sudo nano /etc/nginx/sites-available/heracles          # remplacer les deux noms
sudo ln -s /etc/nginx/sites-available/heracles /etc/nginx/sites-enabled/
sudo nginx -t
sudo certbot --nginx -d heracles.example.fr -d api.heracles.example.fr
sudo systemctl reload nginx
```

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
