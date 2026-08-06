#!/usr/bin/env bash
# Met à jour l'instance d'ESSAI déjà installée.
#
#   sudo ./infra/essai/mettre-a-jour.sh
#
# À lancer sur le VPS, depuis une copie fraîche du dépôt. C'est ce que le
# workflow GitHub Actions exécute après avoir déposé les sources — mais le
# script vit ici, dans le dépôt, pour qu'on puisse le relire, le corriger et le
# rejouer à la main le jour où le workflow ne suffit pas.
#
# Il ne fabrique aucun secret et n'en touche aucun : l'installation initiale
# reste le fait de `deployer.sh`. Celui-ci ne fait que rejouer les migrations
# et reconstruire l'application.

set -euo pipefail

DOSSIER=/opt/supabase-heracles-essai
PREFIXE=heracles-essai
PROJET=heracles-essai
KONG_PORT=8101
DEPOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

rouge() { printf '\033[31m%s\033[0m\n' "$*"; }
vert()  { printf '\033[32m%s\033[0m\n' "$*"; }
etape() { printf '\n\033[1m── %s\033[0m\n' "$*"; }

[[ $EUID -eq 0 ]] || { rouge "À lancer avec sudo."; exit 1; }

if [[ ! -f "$DOSSIER/.env" ]]; then
  rouge "L'instance d'essai n'est pas installée."
  echo  "Lancez d'abord : sudo ./infra/essai/deployer.sh <domaine> <domaine-api>"
  exit 1
fi

# shellcheck disable=SC1091
set -a; source "$DOSSIER/.env"; set +a

etape "Pile Supabase"
# La surcharge est recalculée à partir de la composition réellement clonée : la
# liste des services de Supabase change d'une version à l'autre, et nommer un
# service absent fait échouer tout le démarrage.
node "$DEPOT/infra/supabase/composer-surcharge.mjs" \
  "$DOSSIER/docker-compose.yml" "$PREFIXE" "$KONG_PORT" \
  > "$DOSSIER/docker-compose.override.yml"
( cd "$DOSSIER" && docker compose -p "$PROJET" up -d )

printf 'attente de la base'
for _ in $(seq 1 60); do
  docker exec "$PREFIXE-db" pg_isready -U postgres >/dev/null 2>&1 && break
  printf '.'; sleep 2
done
echo
docker exec "$PREFIXE-db" pg_isready -U postgres >/dev/null || { rouge "La base ne répond pas."; exit 1; }
vert "pile en marche"

# La base répond, mais cela ne suffit pas : le schéma `auth` n'est pas posé par
# PostgreSQL. C'est le service d'authentification qui le crée au démarrage, en
# jouant ses propres migrations — et nos migrations en dépendent dès la
# première ligne. On attend donc qu'il ait fini, et non que la base réponde.
printf 'attente du schéma auth'
for _ in $(seq 1 90); do
  presence="$(docker exec -i "$PREFIXE-db" psql -U postgres -d "$POSTGRES_DB" -tAc \
    "select count(*) from information_schema.schemata where schema_name = 'auth'" 2>/dev/null || echo 0)"
  [ "${presence// /}" = "1" ] && break
  printf '.'; sleep 2
done
echo

presence="$(docker exec -i "$PREFIXE-db" psql -U postgres -d "$POSTGRES_DB" -tAc \
  "select count(*) from information_schema.schemata where schema_name = 'auth'" 2>/dev/null || echo 0)"
if [ "${presence// /}" != "1" ]; then
  rouge "Le schéma auth n'existe toujours pas : le service d'authentification n'a pas démarré."
  echo  "Regardez pourquoi :"
  echo  "  docker logs --tail 40 $PREFIXE-auth"
  exit 1
fi
vert "schéma auth en place"


etape "Migrations"
# Rejouables par construction : `if not exists`, `create or replace`,
# `drop policy if exists`. Les repasser toutes est plus sûr que de tenir un
# registre de ce qui a déjà tourné.
for f in "$DEPOT"/supabase/migrations/*.sql; do
  printf '  %s ' "$(basename "$f")"
  if docker exec -i "$PREFIXE-db" psql -U postgres -d "$POSTGRES_DB" \
       -v ON_ERROR_STOP=1 --single-transaction -q < "$f" >/dev/null 2>&1; then
    vert "ok"
  else
    rouge "ÉCHEC"
    rouge "Rien n'a été reconstruit : l'application tourne encore sur l'ancienne version."
    echo  "Pour voir l'erreur :"
    echo  "  docker exec -i $PREFIXE-db psql -U postgres -d $POSTGRES_DB -v ON_ERROR_STOP=1 < $f"
    exit 1
  fi
done
docker exec -i "$PREFIXE-db" psql -U postgres -d "$POSTGRES_DB" -q \
  -c "notify pgrst, 'reload schema';" >/dev/null
vert "migrations jouées, cache de l'API rechargé"

etape "Application"
[[ -f "$DEPOT/.env.essai" ]] || { rouge "$DEPOT/.env.essai manque — relancez deployer.sh."; exit 1; }
( cd "$DEPOT" && docker compose --env-file .env.essai \
    -f infra/docker-compose.prod.yml -p "$PROJET-web" up -d --build )

etape "Vérification"
port="$(grep '^WEB_PORT=' "$DEPOT/.env.essai" | cut -d= -f2)"
for _ in $(seq 1 30); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${port:-3003}/connexion" || true)"
  [[ "$code" == "200" ]] && break
  sleep 2
done

if [[ "${code:-}" == "200" ]]; then
  vert "l'application répond (HTTP 200 sur /connexion)"
else
  rouge "l'application ne répond pas (HTTP ${code:-aucun})"
  echo  "  docker compose -p $PROJET-web logs --tail 50"
  exit 1
fi

vert "instance d'essai à jour"
