#!/usr/bin/env bash
# Monte l'instance d'ESSAI de HERACLES sur le VPS, de bout en bout.
#
#   sudo ./infra/essai/deployer.sh essai.mondomaine.fr api-essai.mondomaine.fr
#
# Une instance d'essai sert à voir l'application vivre en conditions réelles —
# vrai HTTPS, vrais emails, vrais navigateurs — sans approcher les 107 dossiers
# de personnes réelles. Sa base naît vide et le reste.
#
# Tout est isolé de la future production ET de MyCollabus : dossier, projet
# Docker, préfixe de conteneurs, ports, base de données. Rien ne se croise.
#
#   /opt/supabase-heracles-essai   conteneurs heracles-essai-*
#   Kong      127.0.0.1:8101       (production : 8100)
#   Web       127.0.0.1:3003       (production : 3002)
#
# Le script est rejouable : relancé, il complète ce qui manque sans rien casser.

set -euo pipefail

# `--repartir-de-zero` efface la pile et refait le `.env` depuis le modèle de
# Supabase, en ne gardant que les réglages SMTP. À employer quand un `.env`
# hérité d'une version antérieure du script manque des variables que la pile
# attend. C'est sans regret sur l'ESSAI : sa base naît vide et le reste.
ZERO=0
if [[ "${1:-}" == "--repartir-de-zero" ]]; then ZERO=1; shift; fi

APP="${1:-}"
API="${2:-}"
DOSSIER=/opt/supabase-heracles-essai
PREFIXE=heracles-essai
PROJET=heracles-essai
KONG_PORT=8101
WEB_PORT=3003
# Nom du résolveur de certificats de Traefik, quand c'est lui la façade. Celui
# du VPS s'appelle « letsencrypt » ; à changer si l'installation diffère.
CERTRESOLVER="${HERACLES_CERTRESOLVER:-letsencrypt}"
DEPOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

rouge() { printf '\033[31m%s\033[0m\n' "$*"; }
vert()  { printf '\033[32m%s\033[0m\n' "$*"; }
etape() { printf '\n\033[1m── %s\033[0m\n' "$*"; }

if [[ -z "$APP" || -z "$API" ]]; then
  rouge "Usage : sudo $0 [--repartir-de-zero] <domaine-application> <domaine-api>"
  echo   "Exemple : sudo $0 essai.mondomaine.fr api-essai.mondomaine.fr"
  exit 1
fi

# ————— Ce qu'il faut avoir avant de commencer —————
etape "Vérifications"
[[ $EUID -eq 0 ]] || { rouge "À lancer avec sudo."; exit 1; }
for outil in docker git openssl node nginx curl; do
  command -v "$outil" >/dev/null || { rouge "$outil est absent."; exit 1; }
done
docker compose version >/dev/null 2>&1 || { rouge "Le greffon docker compose est absent."; exit 1; }

# ————— Table rase, si on l'a demandée —————
# Avant le contrôle des ports : c'est souvent notre propre pile qui les tient.
if [[ $ZERO -eq 1 ]]; then
  etape "Table rase"

  # L'instance d'essai a été montée vide. Si elle ne l'est plus, quelqu'un y a
  # fait entrer des dossiers réels — et cette commande les effacerait sans rien
  # demander. Un avertissement dans un commentaire n'aurait protégé personne :
  # on refuse, et on nomme ce qu'il faut faire pour passer outre.
  restants="$(docker exec -i "$PREFIXE-db" psql -U postgres -d postgres -tAc \
    "select count(*) from public.candidat" 2>/dev/null || echo 0)"
  if [[ "${restants// /}" =~ ^[0-9]+$ ]] && [[ "${restants// /}" -gt 0 ]] \
     && [[ "${HERACLES_EFFACER_QUAND_MEME:-}" != "oui" ]]; then
    rouge "Cette base contient ${restants// /} candidats. La table rase les effacerait."
    echo  "Sauvegardez d'abord :"
    echo  "  docker exec $PREFIXE-db pg_dump -U postgres postgres | gzip > /root/heracles-\$(date +%F).sql.gz"
    echo
    echo  "Puis, si c'est bien ce que vous voulez :"
    echo  "  HERACLES_EFFACER_QUAND_MEME=oui $0 --repartir-de-zero $APP $API"
    exit 1
  fi
  # Les réglages SMTP sont les seuls que le script ne sache pas refabriquer :
  # ils viennent du fournisseur de courrier. On les remet dans le `.env` neuf.
  SMTP_GARDE="$(mktemp)"
  trap 'rm -f "$SMTP_GARDE"' EXIT
  if [[ -f "$DOSSIER/.env" ]]; then
    grep -E '^SMTP_(HOST|PORT|USER|PASS|ADMIN_EMAIL)=.' "$DOSSIER/.env" > "$SMTP_GARDE" || true
    if [[ -s "$SMTP_GARDE" ]]; then
      vert "réglages SMTP mis de côté ($(wc -l < "$SMTP_GARDE") lignes)"
    fi
  fi

  if [[ -d "$DOSSIER" ]]; then
    ( cd "$DOSSIER" && docker compose -p "$PROJET" down -v --remove-orphans >/dev/null 2>&1 ) || true
  fi

  # `compose down` ne retrouve ses conteneurs que si la composition et les
  # variables d'alors sont encore lisibles — ce qui n'est pas garanti quand
  # c'est justement le `.env` qu'on vient réparer. Le repêchage par étiquette,
  # lui, ne dépend d'aucun fichier : Docker sait de quel projet vient chaque
  # conteneur. Sans lui, un reste tient le port et le script s'arrête dessus.
  for projet in "$PROJET" "$PROJET-web"; do
    restes="$(docker ps -aq --filter "label=com.docker.compose.project=$projet" 2>/dev/null || true)"
    if [[ -n "$restes" ]]; then
      # shellcheck disable=SC2086
      docker rm -f $restes >/dev/null 2>&1 || true
    fi
    volumes="$(docker volume ls -q --filter "label=com.docker.compose.project=$projet" 2>/dev/null || true)"
    if [[ -n "$volumes" ]]; then
      # shellcheck disable=SC2086
      docker volume rm -f $volumes >/dev/null 2>&1 || true
    fi
  done

  # Le gros de la base n'est pas dans un volume Docker mais dans un dossier
  # monté — `volumes/db/data`. `compose down -v` ne le touche donc jamais, et
  # un cluster survivant garde les mots de passe de rôles d'avant. Le service
  # d'authentification se voit alors refuser l'entrée par la base même :
  #
  #   password authentication failed for user "supabase_auth_admin"
  #
  # Ces mots de passe ne sont posés qu'à la toute première initialisation, à
  # partir de POSTGRES_PASSWORD. Refaire le `.env` sans refaire le cluster,
  # c'est changer la serrure en gardant l'ancienne clé.
  #
  # Le reste de `volumes/` est la configuration livrée avec la pile — les
  # scripts d'amorçage, la déclaration des routes de Kong. On n'y touche pas.
  rm -rf "$DOSSIER/volumes/db/data" "$DOSSIER/volumes/storage"

  rm -f "$DOSSIER/.env"
  vert "pile arrêtée, base et fichiers effacés, .env retiré"
fi

# Les ports de l'essai doivent être libres — ou tenus par l'essai lui-même.
# La nuance est tout le sujet : le script est rejouable, donc il retrouve
# normalement sa propre pile en marche. Refuser un port qu'on tient soi-même,
# c'est s'interdire de se relancer.
for port in "$KONG_PORT" "$WEB_PORT"; do
  ss -lnt "sport = :$port" 2>/dev/null | grep -q LISTEN || continue

  tenant="$(docker ps --filter "publish=$port" --format '{{.Names}}' 2>/dev/null | head -1 || true)"
  a_nous=""
  if [[ -n "$tenant" ]]; then
    a_nous="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' \
                "$tenant" 2>/dev/null || true)"
  fi

  if [[ "$a_nous" == "$PROJET" || "$a_nous" == "$PROJET-web" ]]; then
    echo "  port $port tenu par « $tenant » — c'est notre pile, on continue"
    continue
  fi

  rouge "Le port $port est déjà pris."
  if [[ -n "$tenant" ]]; then
    echo "Il est tenu par le conteneur « $tenant », du projet « ${a_nous:-inconnu} »."
    echo "Ce n'est pas l'instance d'essai : arrêtez-le, ou changez les ports de ce script."
  else
    echo "Aucun conteneur ne le publie : c'est un service du système."
    echo "Arrêtez-le, ou changez les ports de ce script."
  fi
  exit 1
done
vert "outils présents, ports $KONG_PORT et $WEB_PORT disponibles"

# ————— Qui est la façade du VPS —————
# Un seul serveur peut tenir le port 80. Si c'en est déjà un, ce n'est pas à
# nous de le déloger : les autres sites de la machine passent par lui. On se
# déclare auprès de lui.
FACADE=nginx
if ss -lnt 'sport = :80' 2>/dev/null | grep -q LISTEN; then
  if systemctl is-active --quiet nginx; then
    FACADE=nginx
  elif ss -lntp 'sport = :80' 2>/dev/null | grep -q traefik; then
    FACADE=traefik
  else
    rouge "Le port 80 est tenu par un serveur que ce script ne sait pas configurer :"
    ss -lntp 'sport = :80' 2>/dev/null | sed 's/^/  /' || true
    exit 1
  fi
fi
vert "façade : $FACADE"

# ————— La pile Supabase —————
etape "Pile Supabase → $DOSSIER"
if [[ ! -f "$DOSSIER/docker-compose.yml" ]]; then
  mkdir -p "$DOSSIER"
  tmp="$(mktemp -d)"
  git clone --depth 1 --quiet https://github.com/supabase/supabase "$tmp"
  cp -r "$tmp"/docker/* "$DOSSIER"/
  cp "$tmp"/docker/.env.example "$DOSSIER"/.env.supabase-origine
  rm -rf "$tmp"
  vert "pile officielle clonée"
else
  vert "pile déjà présente, on la garde"
fi

# Le modèle d'environnement de Supabase sert de base au nôtre : il faut donc
# l'avoir sous la main, même pour une pile clonée avant que ce script ne le
# mette de côté.
if [[ ! -f "$DOSSIER/.env.supabase-origine" ]]; then
  curl -fsSL --retry 3 -o "$DOSSIER/.env.supabase-origine" \
    https://raw.githubusercontent.com/supabase/supabase/master/docker/.env.example \
    || { rouge "Impossible de récupérer le modèle d'environnement de Supabase."; exit 1; }
fi

# La surcharge est calculée à partir de la composition réellement clonée : la
# liste des services de Supabase change d'une version à l'autre, et nommer un
# service absent fait échouer tout le démarrage.
if [[ "$FACADE" == traefik ]]; then
  node "$DEPOT/infra/supabase/composer-surcharge.mjs" \
    "$DOSSIER/docker-compose.yml" "$PREFIXE" "$KONG_PORT" \
    "$API" "$CERTRESOLVER" "$PREFIXE" \
    > "$DOSSIER/docker-compose.override.yml"
else
  node "$DEPOT/infra/supabase/composer-surcharge.mjs" \
    "$DOSSIER/docker-compose.yml" "$PREFIXE" "$KONG_PORT" \
    > "$DOSSIER/docker-compose.override.yml"
fi

# ————— Les secrets, fabriqués ici et nulle part ailleurs —————
etape "Secrets"
if [[ ! -f "$DOSSIER/.env" ]]; then
  ( umask 077
    bash "$DEPOT/infra/supabase/composer-env.sh" \
      "$DOSSIER/.env.supabase-origine" "$APP" "$API" "$PROJET" > "$DOSSIER/.env" )
  chmod 600 "$DOSSIER/.env"
  vert "secrets fabriqués sur place, .env en 600"

  if [[ $ZERO -eq 1 && -s "${SMTP_GARDE:-/dev/null}" ]]; then
    while IFS= read -r ligne; do
      sed -i "/^${ligne%%=*}=/d" "$DOSSIER/.env"
      printf '%s\n' "$ligne" >> "$DOSSIER/.env"
    done < "$SMTP_GARDE"
    vert "réglages SMTP repris de l'installation précédente"
  fi
else
  vert ".env déjà là — on n'y touche pas (les secrets ne se régénèrent pas)"
fi

# Filet : une pile installée avant que le `.env` ne soit bâti sur le modèle de
# Supabase peut n'avoir aucune de ces lignes. Elles ne portent pas de secret,
# rien n'empêche de les compléter en place — et sans elles, le service
# d'authentification tombe sur un booléen vide et le schéma `auth` n'arrive
# jamais.
for defaut in ENABLE_PHONE_SIGNUP=false ENABLE_PHONE_AUTOCONFIRM=false \
              ENABLE_ANONYMOUS_USERS=false ENABLE_EMAIL_SIGNUP=true \
              ENABLE_EMAIL_AUTOCONFIRM=false DISABLE_SIGNUP=true \
              IMGPROXY_AUTO_WEBP=true FUNCTIONS_VERIFY_JWT=false \
              COMPOSE_FILE=docker-compose.yml:docker-compose.override.yml; do
  cle="${defaut%%=*}"
  grep -q "^$cle=." "$DOSSIER/.env" || {
    sed -i "/^$cle=/d" "$DOSSIER/.env"
    echo "$defaut" >> "$DOSSIER/.env"
    echo "  $cle manquait — ajouté"
  }
done

# shellcheck disable=SC1091
set -a; source "$DOSSIER/.env"; set +a

if [[ -z "${SMTP_HOST:-}" ]]; then
  rouge "SMTP_HOST est vide dans $DOSSIER/.env"
  rouge "Sans SMTP, aucune invitation ne part — donc personne ne peut entrer."
  echo  "Renseignez SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS, puis relancez."
  exit 1
fi

# ————— Démarrage —————
etape "Démarrage de la pile"
( cd "$DOSSIER" && docker compose -p "$PROJET" up -d )

printf 'attente de la base'
for _ in $(seq 1 60); do
  if docker exec "$PREFIXE-db" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  printf '.'; sleep 2
done
echo
docker exec "$PREFIXE-db" pg_isready -U postgres >/dev/null || { rouge "La base ne répond pas."; exit 1; }
vert "pile démarrée"

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
  echo  "Voici ce qu'il dit :"
  docker logs --tail 20 "$PREFIXE-auth" 2>&1 | sed 's/^/  /' || true
  echo
  echo
  echo  "Deux causes reviennent :"
  echo  "  « converting '' to type bool »  → une variable vide dans $DOSSIER/.env,"
  echo  "    nommée dans le message, juste après GOTRUE_."
  echo  "  « password authentication failed » → le cluster PostgreSQL est plus ancien"
  echo  "    que le .env : ses mots de passe de rôles datent d'avant. Relancez avec"
  echo  "    --repartir-de-zero, qui refait les deux ensemble."
  exit 1
fi
vert "schéma auth en place"


# ————— Les migrations —————
etape "Migrations"
for f in "$DEPOT"/supabase/migrations/*.sql; do
  printf '  %s ' "$(basename "$f")"
  if docker exec -i "$PREFIXE-db" psql -U postgres -d "$POSTGRES_DB" \
       -v ON_ERROR_STOP=1 --single-transaction -q < "$f" >/dev/null 2>&1; then
    vert "ok"
  else
    rouge "ÉCHEC"
    rouge "Rejouez-la à la main pour voir l'erreur :"
    echo  "  docker exec -i $PREFIXE-db psql -U postgres -d $POSTGRES_DB -v ON_ERROR_STOP=1 < $f"
    exit 1
  fi
done
# Sans ce rechargement, les fonctions neuves restent invisibles de l'API.
docker exec -i "$PREFIXE-db" psql -U postgres -d "$POSTGRES_DB" -q \
  -c "notify pgrst, 'reload schema';" >/dev/null
vert "migrations jouées, cache de l'API rechargé"

# ————— L'application web —————
etape "Application web"
TRAEFIK_ENABLE=false
[[ "$FACADE" == traefik ]] && TRAEFIK_ENABLE=true

[[ -n "${SERVICE_ROLE_KEY:-}" ]] || { rouge "SERVICE_ROLE_KEY manque dans $DOSSIER/.env"; exit 1; }

cat > "$DEPOT/.env.essai" <<FIN
NEXT_PUBLIC_SUPABASE_URL=https://$API
NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY
NEXT_PUBLIC_APP_URL=https://$APP
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
WEB_PORT=$WEB_PORT
TRAEFIK_ENABLE=$TRAEFIK_ENABLE
TRAEFIK_ROUTEUR=$PREFIXE
TRAEFIK_CERTRESOLVER=$CERTRESOLVER
APP_DOMAIN=$APP
FIN
chmod 600 "$DEPOT/.env.essai"

( cd "$DEPOT" && docker compose --env-file .env.essai \
    -f infra/docker-compose.prod.yml -p "$PROJET-web" up -d --build )

printf 'attente de l’application'
code=""
for _ in $(seq 1 30); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$WEB_PORT/connexion" || true)"
  [[ "$code" == "200" ]] && break
  printf '.'; sleep 2
done
echo
if [[ "$code" != "200" ]]; then
  rouge "l'application ne répond pas sur 127.0.0.1:$WEB_PORT (HTTP ${code:-aucun})"
  docker compose -p "$PROJET-web" logs --tail 30 2>&1 | sed 's/^/  /' || true
  exit 1
fi
vert "application en marche sur 127.0.0.1:$WEB_PORT (HTTP 200 sur /connexion)"

# ————— La façade —————
if [[ "$FACADE" == traefik ]]; then
  etape "Traefik"
  # Rien à configurer chez lui : il lit les étiquettes des conteneurs, que la
  # surcharge et la composition de l'application viennent de poser. Il obtient
  # aussi le certificat tout seul, par le défi HTTP — d'où l'attente.
  vert "les deux noms sont déclarés à Traefik, qui va chercher le certificat"

  printf 'attente du certificat'
  code=""
  for _ in $(seq 1 45); do
    code="$(curl -s -o /dev/null -w '%{http_code}' "https://$APP/connexion" || true)"
    [[ "$code" == "200" ]] && break
    printf '.'; sleep 4
  done
  echo

  if [[ "$code" == "200" ]]; then
    vert "https://$APP répond (HTTP 200 sur /connexion)"
  else
    rouge "https://$APP ne répond pas encore (HTTP ${code:-aucun})."
    echo  "Traefik peut mettre un moment à obtenir le certificat. Regardez :"
    echo  "  docker logs --tail 30 \$(docker ps --filter name=traefik --format '{{.Names}}' | head -1)"
    echo  "Vérifiez surtout que $APP et $API pointent bien vers ce VPS."
  fi

  etape "Instance d'essai en place"
  cat <<FIN

  Application   https://$APP
  API           https://$API
  Base          vide — et qu'elle le reste

  Le premier administrateur — personne ne peut l'inviter :
    HERACLES_API_URL=https://$API \\
    HERACLES_APP_URL=https://$APP \\
    SUPABASE_SERVICE_ROLE_KEY='<SERVICE_ROLE_KEY de $DOSSIER/.env>' \\
      node $DEPOT/outils/premier-admin.mjs vous@exemple.fr --confirmer

  Vérifier que rien ne dépasse :
    ss -lnt | grep -E '$KONG_PORT|$WEB_PORT'   → 127.0.0.1 uniquement
    curl -s -o /dev/null -w '%{http_code}\\n' https://$API/     → 404, Studio hors d'atteinte
    curl -s https://$API/rest/v1/candidat                      → « permission denied »

  Les secrets sont dans $DOSSIER/.env (mode 600). Ils n'existent nulle part
  ailleurs : sauvegardez ce fichier hors du VPS.

FIN
  exit 0
fi

etape "Nginx"
CONF=/etc/nginx/sites-available/heracles-essai
CERT="/etc/letsencrypt/live/$APP/fullchain.pem"
mkdir -p /var/www/html

if [[ -f "$CERT" ]]; then
  sed -e "s|heracles\.example\.fr|$APP|g" -e "s|api\.$APP|$API|g" \
      -e "s|127\.0\.0\.1:3002|127.0.0.1:$WEB_PORT|" \
      -e "s|127\.0\.0\.1:8100|127.0.0.1:$KONG_PORT|" \
      "$DEPOT/infra/nginx/heracles.conf.example" > "$CONF"
  CERT_PRET=1
else
  # Pas encore de certificat, et c'est un piège en boucle : une configuration
  # qui en réclame un fait échouer `nginx -t`, donc tout rechargement, donc
  # certbot lui-même. On ne pourrait plus jamais l'obtenir.
  #
  # On pose donc le strict nécessaire pour que Let's Encrypt puisse vérifier
  # le domaine, et rien d'autre. Surtout pas l'application en clair : un mot
  # de passe y voyagerait à découvert.
  cat > "$CONF" <<FIN
# Configuration PROVISOIRE, écrite par infra/essai/deployer.sh — le temps
# d'obtenir le certificat. Relancez le script après certbot : il la remplace
# par la vraie, en HTTPS.
server {
    listen 80;
    listen [::]:80;
    server_name $APP $API;

    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 503; }
}
FIN
  CERT_PRET=0
fi
ln -sf "$CONF" /etc/nginx/sites-enabled/heracles-essai

if nginx -t 2>/dev/null; then
  # Recharger suppose qu'il tourne. Ce n'est pas acquis : une configuration
  # antérieure — celle qui réclamait un certificat absent — a pu l'empêcher de
  # démarrer, et il est resté couché depuis.
  if systemctl is-active --quiet nginx; then
    systemctl reload nginx
  elif ! systemctl start nginx; then
    rouge "nginx refuse de démarrer :"
    systemctl status nginx --no-pager -l 2>&1 | tail -15 | sed 's/^/  /' || true
    echo
    echo "Qui tient le port 80 :"
    ss -lntp 'sport = :80' 2>/dev/null | sed 's/^/  /' || true
    echo
    echo "Un « Address already in use » désigne un autre serveur en façade —"
    echo "Traefik, par exemple. C'est alors à lui de porter ces deux noms."
    exit 1
  fi

  if [[ $CERT_PRET -eq 1 ]]; then
    vert "nginx rechargé — l'instance est servie en HTTPS"
  else
    vert "nginx rechargé — les deux noms répondent, prêts pour Let's Encrypt"
  fi
else
  rouge "nginx -t échoue :"
  nginx -t 2>&1 | sed 's/^/  /' || true
  exit 1
fi

# ————— Ce qu'il reste à faire à la main —————
if [[ $CERT_PRET -eq 0 ]]; then
  etape "Il manque le certificat"
  cat <<FIN

  Tout est monté, mais rien n'est encore joignable : les deux noms répondent
  503 en clair, exprès. Obtenez le certificat, puis relancez ce script — il
  posera la configuration HTTPS.

    certbot certonly --webroot -w /var/www/html -d $APP -d $API
    $0 $APP $API

  Le greffon --nginx de certbot ferait le premier pas, mais réécrirait la
  configuration à sa façon : on y perdrait les en-têtes de sécurité et le
  refus d'exposer Studio.

FIN
  exit 0
fi

etape "Instance d'essai en place"
cat <<FIN

  Application   https://$APP
  API           https://$API
  Base          vide — et qu'elle le reste

  Le premier administrateur — personne ne peut l'inviter :
    HERACLES_API_URL=https://$API \\
    HERACLES_APP_URL=https://$APP \\
    SUPABASE_SERVICE_ROLE_KEY='<SERVICE_ROLE_KEY de $DOSSIER/.env>' \\
      node $DEPOT/outils/premier-admin.mjs vous@exemple.fr --confirmer

  Vérifier que rien ne dépasse :
    ss -lnt | grep -E '$KONG_PORT|$WEB_PORT'   → 127.0.0.1 uniquement
    curl -s https://$API/rest/v1/candidat      → « permission denied »

  Les secrets sont dans $DOSSIER/.env (mode 600). Ils n'existent nulle part
  ailleurs : sauvegardez ce fichier hors du VPS.

FIN
