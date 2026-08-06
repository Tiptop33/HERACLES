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

APP="${1:-}"
API="${2:-}"
DOSSIER=/opt/supabase-heracles-essai
PREFIXE=heracles-essai
PROJET=heracles-essai
KONG_PORT=8101
WEB_PORT=3003
DEPOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

rouge() { printf '\033[31m%s\033[0m\n' "$*"; }
vert()  { printf '\033[32m%s\033[0m\n' "$*"; }
etape() { printf '\n\033[1m── %s\033[0m\n' "$*"; }

if [[ -z "$APP" || -z "$API" ]]; then
  rouge "Usage : sudo $0 <domaine-application> <domaine-api>"
  echo   "Exemple : sudo $0 essai.mondomaine.fr api-essai.mondomaine.fr"
  exit 1
fi

# ————— Ce qu'il faut avoir avant de commencer —————
etape "Vérifications"
[[ $EUID -eq 0 ]] || { rouge "À lancer avec sudo."; exit 1; }
for outil in docker git openssl node nginx; do
  command -v "$outil" >/dev/null || { rouge "$outil est absent."; exit 1; }
done
docker compose version >/dev/null 2>&1 || { rouge "Le greffon docker compose est absent."; exit 1; }

# Les ports de l'essai doivent être libres — et surtout pas ceux d'un autre.
for port in "$KONG_PORT" "$WEB_PORT"; do
  if ss -lnt "sport = :$port" 2>/dev/null | grep -q LISTEN; then
    rouge "Le port $port est déjà pris. Un autre service l'occupe : arrêtez-le, ou changez ce script."
    exit 1
  fi
done
vert "outils présents, ports $KONG_PORT et $WEB_PORT libres"

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

# La surcharge est calculée à partir de la composition réellement clonée : la
# liste des services de Supabase change d'une version à l'autre, et nommer un
# service absent fait échouer tout le démarrage.
node "$DEPOT/infra/supabase/composer-surcharge.mjs" \
  "$DOSSIER/docker-compose.yml" "$PREFIXE" "$KONG_PORT" \
  > "$DOSSIER/docker-compose.override.yml"

# ————— Les secrets, fabriqués ici et nulle part ailleurs —————
etape "Secrets"
if [[ ! -f "$DOSSIER/.env" ]]; then
  MDP="$(openssl rand -hex 24)"
  JWT="$(openssl rand -hex 32)"
  BASE="$(openssl rand -hex 32)"
  VAULT="$(openssl rand -hex 16)"

  # ANON_KEY et SERVICE_ROLE_KEY sont des JWT signés avec JWT_SECRET. La
  # documentation de Supabase renvoie vers un générateur en ligne ; on ne
  # confie pas un secret à une page web, on le signe ici.
  cles="$(JWT_SECRET="$JWT" node -e '
    const c = require("node:crypto");
    const s = process.env.JWT_SECRET;
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const dans10ans = Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 3600;
    const signer = (role) => {
      const corps = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ iss: "supabase", role, iat: Math.floor(Date.now()/1000), exp: dans10ans })}`;
      return `${corps}.${c.createHmac("sha256", s).update(corps).digest("base64url")}`;
    };
    console.log(signer("anon"));
    console.log(signer("service_role"));
  ')"
  ANON="$(echo "$cles" | sed -n 1p)"
  SERVICE="$(echo "$cles" | sed -n 2p)"

  sed \
    -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$MDP|" \
    -e "s|^JWT_SECRET=.*|JWT_SECRET=$JWT|" \
    -e "s|^ANON_KEY=.*|ANON_KEY=$ANON|" \
    -e "s|^SERVICE_ROLE_KEY=.*|SERVICE_ROLE_KEY=$SERVICE|" \
    -e "s|^SECRET_KEY_BASE=.*|SECRET_KEY_BASE=$BASE|" \
    -e "s|^VAULT_ENC_KEY=.*|VAULT_ENC_KEY=$VAULT|" \
    -e "s|^SITE_URL=.*|SITE_URL=https://$APP|" \
    -e "s|^API_EXTERNAL_URL=.*|API_EXTERNAL_URL=https://$API|" \
    -e "s|^SUPABASE_PUBLIC_URL=.*|SUPABASE_PUBLIC_URL=https://$API|" \
    -e "s|^ADDITIONAL_REDIRECT_URLS=.*|ADDITIONAL_REDIRECT_URLS=https://$APP/auth/callback,https://$APP/invitation/**|" \
    -e "s|^DASHBOARD_PASSWORD=.*|DASHBOARD_PASSWORD=$(openssl rand -hex 12)|" \
    "$DEPOT/infra/supabase/.env.example" > "$DOSSIER/.env"

  chmod 600 "$DOSSIER/.env"
  vert "secrets fabriqués sur place, .env en 600"
else
  vert ".env déjà là — on n'y touche pas (les secrets ne se régénèrent pas)"
fi

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
cat > "$DEPOT/.env.essai" <<FIN
NEXT_PUBLIC_SUPABASE_URL=https://$API
NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY
NEXT_PUBLIC_APP_URL=https://$APP
WEB_PORT=$WEB_PORT
FIN
chmod 600 "$DEPOT/.env.essai"

( cd "$DEPOT" && docker compose --env-file .env.essai \
    -f infra/docker-compose.prod.yml -p "$PROJET-web" up -d --build )
vert "application construite et démarrée sur 127.0.0.1:$WEB_PORT"

# ————— Nginx —————
etape "Nginx"
CONF=/etc/nginx/sites-available/heracles-essai
if [[ ! -f "$CONF" ]]; then
  sed -e "s|heracles\.example\.fr|$APP|g" -e "s|api\.$APP|$API|g" \
      -e "s|127\.0\.0\.1:3002|127.0.0.1:$WEB_PORT|" \
      -e "s|127\.0\.0\.1:8100|127.0.0.1:$KONG_PORT|" \
      "$DEPOT/infra/nginx/heracles.conf.example" > "$CONF"
  ln -sf "$CONF" /etc/nginx/sites-enabled/heracles-essai
  vert "configuration écrite"
else
  vert "configuration déjà là, on la garde"
fi

if nginx -t 2>/dev/null; then
  systemctl reload nginx
  vert "nginx rechargé"
else
  rouge "nginx -t échoue — souvent parce que le certificat n'existe pas encore."
  echo  "Lancez :  certbot --nginx -d $APP -d $API"
  echo  "puis :    nginx -t && systemctl reload nginx"
fi

# ————— Ce qu'il reste à faire à la main —————
etape "Instance d'essai en place"
cat <<FIN

  Application   https://$APP
  API           https://$API
  Base          vide — et qu'elle le reste

  Certificat (si ce n'est pas déjà fait) :
    certbot --nginx -d $APP -d $API

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
