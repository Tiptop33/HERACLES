#!/usr/bin/env bash
# Change le nom de domaine de l'instance HERACLES déjà installée.
#
#   sudo ./changer-de-domaine.sh --verifier oaf-heracles.fr api.oaf-heracles.fr
#   sudo ./changer-de-domaine.sh            oaf-heracles.fr api.oaf-heracles.fr
#
# Le premier ne change rien : il dit si le DNS est prêt et ce qui serait fait.
# Le second fait le changement. La procédure entière, zone DNS chez Hostinger
# comprise, est dans docs/changer-de-domaine.md.
#
# À lancer depuis la copie du déploiement automatique,
# /opt/heracles-essai-depot, une fois que la version qui porte ce script y est
# arrivée.
#
# POURQUOI UN SCRIPT, ET PAS « deployer.sh AVEC LES NOUVEAUX NOMS »
#
#   1. `deployer.sh` ne réécrit jamais le `.env` de la pile quand il existe :
#      les secrets ne se refont pas. Or c'est là que vivent les adresses
#      qu'emploie l'authentification (SITE_URL, API_EXTERNAL_URL…). Relancé
#      avec un autre nom, il construisait l'application pour le nouveau nom
#      tandis que les courriels d'invitation menaient encore à l'ancien.
#   2. Le déploiement automatique lit le `.env.essai` de
#      /opt/heracles-essai-depot, pas celui de la copie d'où l'on lance
#      `deployer.sh`. La fusion suivante remettait l'ancien nom sans rien dire.
#   3. Les liens déjà envoyés — loges de Guyenne et Gascogne, parrainages, CV
#      anonymes — portent l'ancien nom. Ils doivent aboutir encore : l'ancien
#      nom renvoie vers le nouveau, chemin compris, et le `www.` aussi.
#
# Ce que le script ne fait pas : toucher au DNS (c'est chez Hostinger, à la
# main), ni à Brevo (l'adresse d'expédition reste celle d'avant, déjà
# authentifiée), ni à Bubble.

set -euo pipefail

VERIFIER=0
if [[ "${1:-}" == "--verifier" ]]; then VERIFIER=1; shift; fi

DOSSIER=/opt/supabase-heracles-essai
DEPOT_DEPLOIEMENT=/opt/heracles-essai-depot
WEB_PORT=3003
DEPOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONF=/etc/nginx/sites-available/heracles-essai
CONF_REDIRECTIONS=/etc/nginx/sites-available/heracles-essai-redirections

rouge() { printf '\033[31m%s\033[0m\n' "$*"; }
vert()  { printf '\033[32m%s\033[0m\n' "$*"; }
jaune() { printf '\033[33m%s\033[0m\n' "$*"; }
etape() { printf '\n\033[1m── %s\033[0m\n' "$*"; }

# Un nom tapé avec son « https:// » ou une barre finale reste reconnu.
nettoyer() {
  local n="${1,,}"
  n="${n#https://}"; n="${n#http://}"; n="${n%%/*}"
  printf '%s' "$n"
}

APP="$(nettoyer "${1:-}")"
API="$(nettoyer "${2:-}")"

if [[ -z "$APP" || -z "$API" ]]; then
  rouge "Usage : sudo $0 [--verifier] <domaine-application> <domaine-api>"
  echo  "Exemple : sudo $0 --verifier oaf-heracles.fr api.oaf-heracles.fr"
  exit 1
fi

NOM_VALIDE='^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'
for n in "$APP" "$API"; do
  [[ "$n" =~ $NOM_VALIDE ]] || { rouge "Nom de domaine invalide : $n"; exit 1; }
done
[[ "$APP" != "$API" ]] || { rouge "L'application et l'API demandent deux noms distincts."; exit 1; }

# La valeur d'une clé dans un fichier d'environnement, guillemets ôtés. Rien
# n'est affiché : ces fichiers portent des secrets.
valeur() {
  local v
  v="$(grep -m1 "^$1=" "$2" 2>/dev/null | cut -d= -f2- || true)"
  v="${v#\'}"; v="${v%\'}"
  printf '%s' "$v"
}

# L'hôte d'une adresse : `https://essai.exemple.fr/` → `essai.exemple.fr`.
hote() {
  local u="${1#*://}"
  u="${u%%/*}"
  printf '%s' "${u,,}"
}

# Pose `cle=valeur` à la place de la ligne existante, ou à la fin. La valeur
# passe par l'environnement, jamais par `sed` ni `awk -v` : les accents
# graves, les barres et les antislashs des règles de Traefik y seraient
# interprétés. Le fichier est refait à côté puis substitué d'un coup — un
# fichier à moitié écrit ne doit jamais être lu par un déploiement.
regler() {
  local fichier="$1" cle="$2" tmp
  tmp="$(umask 077; mktemp "$fichier.XXXXXX")"
  VALEUR="$3" awk -v cle="$cle" '
    BEGIN { ligne = cle "=" ENVIRON["VALEUR"]; fait = 0 }
    index($0, cle "=") == 1 { if (!fait) { print ligne; fait = 1 }; next }
    { print }
    END { if (!fait) print ligne }
  ' "$fichier" > "$tmp"
  chown --reference="$fichier" "$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$fichier"
}

# Retire la clé, s'il y en a une.
oter() {
  local fichier="$1" cle="$2" tmp
  grep -q "^$cle=" "$fichier" || return 0
  tmp="$(umask 077; mktemp "$fichier.XXXXXX")"
  grep -v "^$cle=" "$fichier" > "$tmp" || true
  chown --reference="$fichier" "$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$fichier"
}

# ————— Ce qu'il faut avoir avant de commencer —————
etape "Vérifications"
[[ $EUID -eq 0 ]] || { rouge "À lancer avec sudo."; exit 1; }
for outil in docker getent curl awk openssl; do
  command -v "$outil" >/dev/null || { rouge "$outil est absent."; exit 1; }
done

if [[ ! -f "$DOSSIER/.env" ]]; then
  rouge "L'instance n'est pas installée : $DOSSIER/.env manque."
  echo  "Une première installation se fait avec deployer.sh, directement sous le bon nom."
  exit 1
fi

# Les `.env.essai` à tenir à jour : celui du déploiement automatique d'abord,
# celui de la copie d'où l'on lance le script s'il est ailleurs. Un seul
# oublié, et il remettrait l'ancien nom au premier usage.
ENV_APPLIS=()
for f in "$DEPOT_DEPLOIEMENT/.env.essai" "$DEPOT/.env.essai"; do
  [[ -f "$f" ]] || continue
  deja=0
  for g in "${ENV_APPLIS[@]}"; do [[ "$g" -ef "$f" ]] && deja=1; done
  [[ $deja -eq 1 ]] || ENV_APPLIS+=("$f")
done
if [[ ${#ENV_APPLIS[@]} -eq 0 ]]; then
  rouge "Aucun .env.essai trouvé — ni dans $DEPOT_DEPLOIEMENT, ni dans $DEPOT."
  exit 1
fi

# La mise à jour se joue depuis la copie du déploiement automatique : c'est
# le code qui tourne, celui de `main`. Et cette copie doit déjà savoir lire
# les redirections, sinon l'ancien nom ne mènerait plus nulle part.
MAJ_DEPOT="$DEPOT"
[[ -d "$DEPOT_DEPLOIEMENT/.git" ]] && MAJ_DEPOT="$DEPOT_DEPLOIEMENT"
if ! grep -q 'TRAEFIK_HOTES_REDIRIGES' "$MAJ_DEPOT/infra/docker-compose.prod.yml"; then
  rouge "$MAJ_DEPOT n'a pas encore la version qui sait rediriger l'ancien nom."
  echo  "Laissez le déploiement automatique passer après la fusion, puis relancez."
  exit 1
fi
vert "instance installée · ${#ENV_APPLIS[@]} fichier(s) .env.essai · code de $MAJ_DEPOT"

ANCIEN_APP="$(hote "$(valeur SITE_URL "$DOSSIER/.env")")"
ANCIENNE_API="$(hote "$(valeur SUPABASE_PUBLIC_URL "$DOSSIER/.env")")"
[[ -n "$ANCIEN_APP" && -n "$ANCIENNE_API" ]] || {
  rouge "SITE_URL ou SUPABASE_PUBLIC_URL est vide dans $DOSSIER/.env."
  exit 1
}

# Le `www.` d'un nom nu : `oaf-heracles.fr` en appelle un, `essai.exemple.fr`
# non. Les marque-pages et les cartes de visite l'écrivent souvent.
WWW=""
[[ "$APP" =~ ^[^.]+\.[^.]+$ ]] && WWW="www.$APP"

# ————— Le DNS mène-t-il bien ici ? —————
# Sans cela, Let's Encrypt refuse le certificat et le site tombe. On compare
# ce que répond le DNS aux adresses de cette machine : chez Hostinger,
# l'adresse publique est portée par l'interface, sans traduction.
etape "DNS"
LOCALES=" $(hostname -I 2>/dev/null || true) "

pointe_ici() {
  local nom="$1" v4 v6 a ok=0
  v4="$(getent ahostsv4 "$nom" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ' || true)"
  # Sans entrée AAAA, la résolution v6 rend l'adresse v4 déguisée en ::ffff:.
  v6="$(getent ahostsv6 "$nom" 2>/dev/null | awk '{print $1}' | grep -vi '^::ffff:' | sort -u | tr '\n' ' ' || true)"
  if [[ -z "${v4// /}" ]]; then
    printf '  %-34s aucune adresse IPv4\n' "$nom"
    return 1
  fi
  for a in $v4 $v6; do
    [[ "$LOCALES" == *" $a "* ]] || ok=1
  done
  printf '  %-34s %s%s\n' "$nom" "$v4" "${v6:+$v6}"
  for a in $v4; do
    [[ "$LOCALES" == *" $a "* ]] || \
      echo "    ↳ l'entrée A $a mène ailleurs : elle doit porter l'adresse de ce serveur"
  done
  for a in $v6; do
    [[ "$LOCALES" == *" $a "* ]] || \
      echo "    ↳ l'entrée AAAA $a mène ailleurs : supprimez-la, sinon les accès en IPv6 n'arrivent pas ici"
  done
  return $ok
}

MANQUE_DNS=""
for n in "$APP" ${WWW:+"$WWW"} "$API"; do
  pointe_ici "$n" || MANQUE_DNS="$MANQUE_DNS $n"
done

# Les noms à rediriger : ceux d'une bascule précédente, l'ancien nom de
# l'application, et le `www.`. Seuls restent ceux qui mènent encore ici —
# un nom rendu à Bubble ou abandonné n'a plus rien à faire chez nous, et
# Traefik s'acharnerait à lui chercher un certificat.
CANDIDATS="$(valeur DOMAINES_REDIRIGES "${ENV_APPLIS[0]}")"
CANDIDATS="${CANDIDATS//,/ } $ANCIEN_APP $WWW"
REDIRIGES=()
for n in $CANDIDATS; do
  [[ "$n" == "$APP" || "$n" == "$API" ]] && continue
  deja=0
  for r in "${REDIRIGES[@]}"; do [[ "$r" == "$n" ]] && deja=1; done
  [[ $deja -eq 1 ]] && continue
  # Sans vérification du DNS, on ne sait pas trier : on garde tout.
  if [[ "$n" == "$WWW" || "${HERACLES_SANS_VERIFIER_DNS:-}" == "oui" ]] \
     || pointe_ici "$n" >/dev/null; then
    REDIRIGES+=("$n")
  else
    jaune "  $n ne mène plus ici : il ne sera pas redirigé"
  fi
done

if [[ -n "$MANQUE_DNS" ]]; then
  rouge "Ces noms ne mènent pas encore à ce serveur :$MANQUE_DNS"
  echo  "Adresses de ce serveur :$LOCALES"
  echo  "Chez Hostinger : hPanel → Noms de domaine → le domaine → DNS / Serveurs de"
  echo  "noms (pas le « Gestionnaire DNS » du VPS). Voir docs/changer-de-domaine.md."
  echo  "Une modification met de quelques minutes à quelques heures à se propager,"
  echo  "selon le TTL de l'ancienne entrée."
  if [[ "${HERACLES_SANS_VERIFIER_DNS:-}" != "oui" ]]; then
    exit 1
  fi
  jaune "HERACLES_SANS_VERIFIER_DNS=oui : on continue quand même."
else
  vert "les noms mènent tous à ce serveur"
fi

# ————— Qui est la façade du VPS —————
# Même détection que deployer.sh : on ne déloge personne du port 80.
FACADE=nginx
if ss -lnt 'sport = :80' 2>/dev/null | grep -q LISTEN; then
  if systemctl is-active --quiet nginx; then
    FACADE=nginx
  elif ss -lntp 'sport = :80' 2>/dev/null | grep -q traefik; then
    FACADE=traefik
  else
    rouge "Le port 80 est tenu par un serveur que ce script ne sait pas configurer."
    exit 1
  fi
fi
vert "façade : $FACADE"

etape "Ce qui va changer"
cat <<FIN
  Application   https://$ANCIEN_APP  →  https://$APP
  API           https://$ANCIENNE_API  →  https://$API
  Redirigés     ${REDIRIGES[*]:-aucun}  →  https://$APP, chemin compris
  Fichiers      $DOSSIER/.env
$(printf '                %s\n' "${ENV_APPLIS[@]}")
FIN

if [[ $VERIFIER -eq 1 ]]; then
  echo
  vert "Vérification seule : rien n'a été modifié."
  exit 0
fi

# Un certificat couvre-t-il ce nom ?
couvre() {
  [[ -f "$1" ]] || return 1
  openssl x509 -in "$1" -noout -ext subjectAltName 2>/dev/null \
    | tr ',' '\n' | sed 's/^ *DNS://' | grep -qxF "$2"
}

# Le premier certificat de Let's Encrypt qui couvre ce nom, s'il y en a un.
certificat_de() {
  local c
  for c in /etc/letsencrypt/live/*/fullchain.pem; do
    couvre "$c" "$1" && { printf '%s' "${c%/fullchain.pem}"; return 0; }
  done
  return 1
}

# ————— Nginx : le certificat d'abord —————
# Avant de toucher à quoi que ce soit : s'il ne vient pas, rien n'a bougé et
# l'instance tourne comme avant. Traefik, lui, le cherche tout seul.
CERT_NEUF="/etc/letsencrypt/live/$APP"
if [[ "$FACADE" == nginx ]]; then
  etape "Certificat"
  NOMS_CERT=("$APP" ${WWW:+"$WWW"} "$API")
  complet=1
  for n in "${NOMS_CERT[@]}"; do couvre "$CERT_NEUF/fullchain.pem" "$n" || complet=0; done

  if [[ $complet -eq 1 ]]; then
    vert "le certificat de $APP couvre déjà ${NOMS_CERT[*]}"
  else
    command -v certbot >/dev/null || { rouge "certbot est absent."; exit 1; }
    command -v nginx   >/dev/null || { rouge "nginx est absent."; exit 1; }
    mkdir -p /var/www/html
    # Le temps de la vérification, les nouveaux noms répondent en clair au
    # seul défi de Let's Encrypt. La configuration en place n'est pas touchée.
    cat > "$CONF_REDIRECTIONS" <<FIN
# PROVISOIRE, écrit par infra/essai/changer-de-domaine.sh — le temps
# d'obtenir le certificat des nouveaux noms.
server {
    listen 80;
    listen [::]:80;
    server_name ${NOMS_CERT[*]};

    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 503; }
}
FIN
    ln -sf "$CONF_REDIRECTIONS" /etc/nginx/sites-enabled/heracles-essai-redirections
    nginx -t 2>/dev/null || { rouge "nginx -t échoue :"; nginx -t 2>&1 | sed 's/^/  /' || true; exit 1; }
    systemctl reload nginx

    args=()
    for n in "${NOMS_CERT[@]}"; do args+=(-d "$n"); done
    if certbot certonly --webroot -w /var/www/html --non-interactive \
         --cert-name "$APP" "${args[@]}"; then
      vert "certificat obtenu pour ${NOMS_CERT[*]}"
    else
      rouge "Let's Encrypt a refusé le certificat. Rien d'autre n'a changé."
      echo  "Causes habituelles : un nom qui ne mène pas encore ici, une entrée AAAA"
      echo  "restée vers l'ancien hébergeur, une entrée CAA qui n'autorise pas"
      echo  "letsencrypt.org. Corrigez, puis relancez ce script."
      exit 1
    fi
  fi
fi

# ————— La copie de sûreté —————
etape "Copie de sûreté"
HORODATAGE="$(date +%Y%m%d-%H%M%S)"
SAUVES=("$DOSSIER/.env" "${ENV_APPLIS[@]}")
[[ -f "$CONF" ]] && SAUVES+=("$CONF")
for f in "${SAUVES[@]}"; do
  # `-p` garde le mode 600 : ces copies portent les mêmes secrets.
  cp -p "$f" "$f.avant-domaine-$HORODATAGE"
  echo "  $f.avant-domaine-$HORODATAGE"
done

# Si la suite échoue, on dit comment revenir en arrière, sans le faire tout
# seul : une restauration à l'aveugle pourrait défaire ce qui, lui, a marché.
MODIFIE=0
au_secours() {
  local code=$?
  [[ $code -ne 0 && $MODIFIE -eq 1 ]] || return 0
  echo
  rouge "Le changement s'est arrêté en route. Pour revenir à $ANCIEN_APP :"
  for f in "${SAUVES[@]}"; do
    echo "  cp -p $f.avant-domaine-$HORODATAGE $f"
  done
  echo "  sudo $MAJ_DEPOT/infra/essai/mettre-a-jour.sh"
  [[ "$FACADE" == nginx ]] && echo "  rm -f /etc/nginx/sites-enabled/heracles-essai-redirections && systemctl reload nginx"
}
trap au_secours EXIT

# ————— Les adresses —————
etape "Adresses"
MODIFIE=1

# La pile Supabase. La liste des retours permis est récrite nom pour nom
# plutôt que refaite : une adresse ajoutée à la main y survit.
regler "$DOSSIER/.env" SITE_URL            "https://$APP"
regler "$DOSSIER/.env" SUPABASE_PUBLIC_URL "https://$API"
regler "$DOSSIER/.env" API_EXTERNAL_URL    "https://$API/auth/v1"
retours="$(valeur ADDITIONAL_REDIRECT_URLS "$DOSSIER/.env")"
[[ -n "$retours" ]] || retours="https://$ANCIEN_APP/auth/callback,https://$ANCIEN_APP/invitation/**"
regler "$DOSSIER/.env" ADDITIONAL_REDIRECT_URLS "${retours//"https://$ANCIEN_APP"/"https://$APP"}"
vert "$DOSSIER/.env"

# L'application. `NEXT_PUBLIC_*` est figée à la construction : la mise à jour
# qui suit reconstruit l'image.
if [[ ${#REDIRIGES[@]} -gt 0 ]]; then
  liste="$(IFS=,; printf '%s' "${REDIRIGES[*]}")"
  regle=""
  motif=""
  for n in "${REDIRIGES[@]}"; do
    regle="$regle || Host(\`$n\`)"
    motif="$motif|${n//./\\.}"
  done
  # Ancré au bout (`\z`, et non `$` que Compose prendrait pour une variable) :
  # `ancien.exemple.fr.ailleurs.com` ne doit pas passer pour l'ancien nom.
  motif="^https?://(?:${motif#|})(?::[0-9]+)?(/.*)?\\z"
fi
for f in "${ENV_APPLIS[@]}"; do
  regler "$f" NEXT_PUBLIC_SUPABASE_URL "https://$API"
  regler "$f" NEXT_PUBLIC_APP_URL      "https://$APP"
  regler "$f" APP_DOMAIN               "$APP"
  if [[ ${#REDIRIGES[@]} -gt 0 ]]; then
    regler "$f" DOMAINES_REDIRIGES "$liste"
    # Entre apostrophes : Compose les lit telles quelles, et un `source` du
    # fichier n'exécuterait pas ce qui est entre accents graves.
    regler "$f" TRAEFIK_HOTES_REDIRIGES   "'$regle'"
    regler "$f" TRAEFIK_MOTIF_REDIRECTION "'$motif'"
  else
    oter "$f" DOMAINES_REDIRIGES
    oter "$f" TRAEFIK_HOTES_REDIRIGES
    oter "$f" TRAEFIK_MOTIF_REDIRECTION
  fi
  vert "$f"
done

# ————— Pile, migrations, application —————
# `mettre-a-jour.sh` recrée les services dont la configuration a changé —
# l'authentification relit ses adresses —, déclare la nouvelle API à Traefik
# s'il est la façade, et reconstruit l'application sous le nouveau nom.
etape "Mise à jour"
"$MAJ_DEPOT/infra/essai/mettre-a-jour.sh"

# ————— Nginx : la configuration définitive —————
SANS_CERT=()
if [[ "$FACADE" == nginx ]]; then
  etape "Nginx"
  sed -e "s|api\.heracles\.example\.fr|$API|g" -e "s|heracles\.example\.fr|$APP|g" \
      -e "s|127\.0\.0\.1:3002|127.0.0.1:$WEB_PORT|" \
      -e "s|127\.0\.0\.1:8100|127.0.0.1:8101|" \
      "$MAJ_DEPOT/infra/nginx/heracles.conf.example" > "$CONF"

  {
    echo "# Écrit par infra/essai/changer-de-domaine.sh — les anciens noms du site,"
    echo "# renvoyés vers https://$APP, chemin compris."
    if [[ ${#REDIRIGES[@]} -gt 0 ]]; then
      cat <<FIN

server {
    listen 80;
    listen [::]:80;
    server_name ${REDIRIGES[*]};

    # Le renouvellement des anciens certificats passe encore par ici.
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://$APP\$request_uri; }
}
FIN
      for n in "${REDIRIGES[@]}"; do
        if [[ "$n" == "$WWW" ]]; then
          cert="$CERT_NEUF"
        else
          cert="$(certificat_de "$n" || true)"
        fi
        if [[ -z "$cert" ]]; then
          jaune "  aucun certificat pour $n : il n'est redirigé qu'en http" >&2
          SANS_CERT+=("$n")
          continue
        fi
        cat <<FIN

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name $n;

    ssl_certificate     $cert/fullchain.pem;
    ssl_certificate_key $cert/privkey.pem;
    ssl_protocols             TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache         shared:SSL:10m;
    ssl_session_timeout       1d;
    ssl_session_tickets       off;

    return 301 https://$APP\$request_uri;
}
FIN
      done
    fi
  } > "$CONF_REDIRECTIONS"
  ln -sf "$CONF" /etc/nginx/sites-enabled/heracles-essai
  ln -sf "$CONF_REDIRECTIONS" /etc/nginx/sites-enabled/heracles-essai-redirections

  if nginx -t 2>/dev/null; then
    systemctl reload nginx
    vert "nginx rechargé"
  else
    rouge "nginx -t échoue — l'ancienne configuration est remise :"
    nginx -t 2>&1 | sed 's/^/  /' || true
    cp -p "$CONF.avant-domaine-$HORODATAGE" "$CONF"
    rm -f /etc/nginx/sites-enabled/heracles-essai-redirections
    nginx -t 2>/dev/null && systemctl reload nginx
    exit 1
  fi
fi

# ————— Vérification, de l'extérieur —————
# Tout est en place : un échec ici ne veut plus dire « à moitié fait », et la
# marche arrière affichée par `au_secours` serait un mauvais conseil.
trap - EXIT
etape "Vérification"

# Une configuration rechargée, des étiquettes relues par Traefik, un
# certificat obtenu : rien de cela n'est instantané, et un contrôle fait trop
# tôt interroge encore l'ancienne configuration. Chacun se retente donc, dans
# une limite.
essayer() {
  local fin=$((SECONDS + $1)); shift
  until "$@"; do
    (( SECONDS < fin )) || return 1
    sleep 3
  done
}
REPONSE=""
repond() {
  REPONSE="$(curl -s -o /dev/null -w '%{http_code}' "https://$APP/connexion" || true)"
  [[ "$REPONSE" == "200" ]]
}
redirige() {
  REPONSE="$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "$1://$2/connexion?essai=1" || true)"
  [[ "$REPONSE" == "301 https://$APP/connexion?essai=1" || "$REPONSE" == "308 https://$APP/connexion?essai=1" ]]
}
api_close() {
  REPONSE="$(curl -s -o /dev/null -w '%{http_code}' "https://$API/rest/v1/" || true)"
  [[ "$REPONSE" == "401" ]]
}

ECHECS=0
# Traefik va chercher le certificat au premier appel : trois minutes.
echo "attente de https://$APP…"
if essayer 180 repond; then
  vert "https://$APP répond (HTTP 200 sur /connexion)"
else
  rouge "https://$APP ne répond pas (HTTP ${REPONSE:-aucun})."
  [[ "$FACADE" == traefik ]] && \
    echo "  docker logs --tail 30 \$(docker ps --filter name=traefik --format '{{.Names}}' | head -1)"
  ECHECS=1
fi

for n in "${REDIRIGES[@]}"; do
  schema=https
  for s in "${SANS_CERT[@]}"; do [[ "$s" == "$n" ]] && schema=http; done
  if essayer 90 redirige "$schema" "$n"; then
    vert "$schema://$n → https://$APP, chemin compris"
  else
    rouge "$schema://$n ne redirige pas comme prévu (reçu : ${REPONSE:-rien})"
    ECHECS=1
  fi
done

if essayer 90 api_close; then
  vert "https://$API répond, et ne sert rien sans clé (HTTP 401)"
else
  rouge "https://$API/rest/v1/ répond HTTP ${REPONSE:-aucun} — attendu : 401."
  ECHECS=1
fi
studio="$(curl -s -o /dev/null -w '%{http_code}' "https://$API/" || true)"
if [[ "$studio" == "200" ]]; then
  rouge "https://$API/ répond 200 : Studio serait exposé. À fermer avant toute annonce."
  ECHECS=1
fi

if [[ $ECHECS -ne 0 ]]; then
  echo
  rouge "Le changement est fait, mais ces vérifications échouent."
  echo  "Un certificat que Traefik n'a pas encore obtenu se règle en attendant :"
  echo  "relancez ce script avec les mêmes noms, il ne refait que ce qui manque."
  echo  "Pour revenir à $ANCIEN_APP, voir « Revenir en arrière » dans"
  echo  "docs/changer-de-domaine.md (copies : *.avant-domaine-$HORODATAGE)."
  exit 1
fi

etape "HERACLES est sur https://$APP"
cat <<FIN

  Chacun devra se reconnecter une fois : une session ne passe pas d'un nom à
  l'autre. Les mots de passe, eux, ne changent pas.

  Une invitation, un lien de connexion ou de mot de passe oublié envoyé
  avant ce changement mène à l'ancienne API : il est à renvoyer.

  Restent à la main (docs/changer-de-domaine.md) :
    - l'entrée DNS de $ANCIENNE_API, qui ne sert plus — à garder tant que
      des liens de la veille peuvent traîner, puis à retirer ;
    - si la connexion par Google est activée : déclarer
      https://$API/auth/v1/callback dans la console Google.

  Les copies de sûreté (*.avant-domaine-$HORODATAGE) portent des secrets :
  elles restent ici, en 600, et ne sortent du serveur qu'avec la sauvegarde.

FIN
