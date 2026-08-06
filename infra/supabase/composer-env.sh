#!/usr/bin/env bash
# Fabrique le `.env` d'une pile Supabase HERACLES, sur la sortie standard.
#
#   composer-env.sh <modele> <domaine-app> <domaine-api> <nom-pile> > .env
#
# On part du modèle de Supabase lui-même — `docker/.env.example`, copié au
# moment du clonage — et non d'un modèle à nous. Raison : la composition
# Docker de Supabase lit une trentaine de variables, la liste change d'une
# version à l'autre, et une variable absente du `.env` n'arrive pas absente
# mais **vide**. Un booléen vide fait tomber le service qui l'attend :
#
#   fatal  assigning GOTRUE_EXTERNAL_PHONE_ENABLED to Enabled:
#          converting '' to type bool
#
# Or sans service d'authentification, pas de schéma `auth` ; sans schéma
# `auth`, aucune de nos migrations ne passe. Une variable oubliée arrête donc
# toute l'installation, très loin de sa cause.
#
# Ce script ne fait que trois choses au modèle :
#   1. remplacer TOUS les secrets publiés (le modèle est public : ses mots de
#      passe et ses clés S3 le sont aussi) ;
#   2. poser les adresses de l'instance ;
#   3. refermer ce que Supabase laisse ouvert par défaut.
#
# Tout le reste est laissé tel quel, y compris les variables qu'on ne
# comprend pas : c'est précisément celles-là qui manquent, sinon.

set -euo pipefail

MODELE="${1:-}"
APP="${2:-}"
API="${3:-}"
PILE="${4:-}"

if [[ -z "$MODELE" || -z "$APP" || -z "$API" || -z "$PILE" ]]; then
  echo "Usage : composer-env.sh <modele> <domaine-app> <domaine-api> <nom-pile>" >&2
  exit 1
fi
[[ -f "$MODELE" ]] || { echo "Modèle introuvable : $MODELE" >&2; exit 1; }

SORTIE="$(mktemp)"
trap 'rm -f "$SORTIE"' EXIT
cp "$MODELE" "$SORTIE"

# Remplace la valeur si la clé existe, l'ajoute sinon. Les deux cas arrivent :
# certaines clés disparaissent du modèle d'une version à l'autre, mais la
# composition continue de les lire.
regler() {
  local cle="$1" val="${2//&/\\&}"
  if grep -q "^${cle}=" "$SORTIE"; then
    sed -i "s|^${cle}=.*|${cle}=${val}|" "$SORTIE"
  else
    printf '%s=%s\n' "$cle" "$val" >> "$SORTIE"
  fi
}

# ————— 1. Les secrets —————
# Le modèle est publié sur GitHub : chacune de ses valeurs par défaut est
# connue de la Terre entière, clés S3 comprises. Aucune ne survit ici.
# Les longueurs sont imposées par les services qui les lisent.
# ANON_KEY et SERVICE_ROLE_KEY sont des JWT signés avec JWT_SECRET. La
# documentation de Supabase renvoie vers un générateur en ligne ; on ne confie
# pas un secret à une page web, on le signe ici.
JWT="$(openssl rand -hex 32)"
cles="$(JWT_SECRET="$JWT" node -e '
  const c = require("node:crypto");
  const s = process.env.JWT_SECRET;
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const maintenant = Math.floor(Date.now() / 1000);
  const signer = (role) => {
    const corps = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ iss: "supabase", role, iat: maintenant, exp: maintenant + 10 * 365 * 24 * 3600 })}`;
    return `${corps}.${c.createHmac("sha256", s).update(corps).digest("base64url")}`;
  };
  console.log(signer("anon"));
  console.log(signer("service_role"));
')"

regler POSTGRES_PASSWORD              "$(openssl rand -hex 24)"
regler JWT_SECRET                     "$JWT"
regler ANON_KEY                       "$(echo "$cles" | sed -n 1p)"
regler SERVICE_ROLE_KEY               "$(echo "$cles" | sed -n 2p)"
regler SECRET_KEY_BASE                "$(openssl rand -hex 32)"   # ≥ 64 caractères
regler VAULT_ENC_KEY                  "$(openssl rand -hex 16)"   # exactement 32
regler REALTIME_DB_ENC_KEY            "$(openssl rand -hex 8)"    # exactement 16
regler PG_META_CRYPTO_KEY             "$(openssl rand -hex 24)"   # ≥ 32
regler LOGFLARE_PUBLIC_ACCESS_TOKEN   "$(openssl rand -hex 24)"
regler LOGFLARE_PRIVATE_ACCESS_TOKEN  "$(openssl rand -hex 24)"
regler S3_PROTOCOL_ACCESS_KEY_ID      "$(openssl rand -hex 16)"
regler S3_PROTOCOL_ACCESS_KEY_SECRET  "$(openssl rand -hex 32)"
regler MINIO_ROOT_PASSWORD            "$(openssl rand -hex 16)"
regler DASHBOARD_USERNAME             heracles
regler DASHBOARD_PASSWORD             "$(openssl rand -hex 12)"

# ————— 2. Les adresses —————
regler SITE_URL             "https://$APP"
regler SUPABASE_PUBLIC_URL  "https://$API"
# Le modèle y met le chemin de l'authentification : c'est la racine que GoTrue
# emploie pour bâtir les liens des courriels. Ne pas s'en écarter, sinon le
# lien d'invitation tombe sur une route que Kong ne connaît pas.
regler API_EXTERNAL_URL     "https://$API/auth/v1"

# Les seules adresses vers lesquelles un lien de courriel a le droit de
# renvoyer. Le motif d'invitation est indispensable : sans lui, personne
# n'entre — l'inscription libre est fermée.
regler ADDITIONAL_REDIRECT_URLS "https://$APP/auth/callback,https://$APP/invitation/**"

# ————— 3. Ce que Supabase laisse ouvert —————
# Inscription libre fermée : on n'entre qu'invité (migration 0009). C'est une
# seconde barrière, derrière celle de l'application.
regler DISABLE_SIGNUP            true
regler ENABLE_EMAIL_SIGNUP       true
regler ENABLE_EMAIL_AUTOCONFIRM  false
regler ENABLE_ANONYMOUS_USERS    false
# Le modèle active l'authentification par téléphone, sans fournisseur de SMS.
# Une porte qui ne mène nulle part reste une porte.
regler ENABLE_PHONE_SIGNUP       false
regler ENABLE_PHONE_AUTOCONFIRM  false

# La surcharge porte le préfixe des conteneurs et ne publie que Kong, sur
# 127.0.0.1. Elle DOIT être nommée : dès que `COMPOSE_FILE` est renseigné —
# et le modèle le renseigne — Docker cesse de ramasser
# `docker-compose.override.yml` tout seul. L'oubli ne casse rien de visible :
# la pile démarre, sans préfixe et avec tous ses ports ouverts sur Internet.
regler COMPOSE_FILE "docker-compose.yml:docker-compose.override.yml"

# ————— Le courrier —————
# Sans SMTP, aucune invitation ne part, donc personne ne peut entrer. Les
# valeurs de démonstration du modèle pointent vers une boîte aux lettres
# factice : on les vide, pour que l'installateur s'arrête et réclame les
# vraies plutôt que d'avaler les courriels en silence.
regler SMTP_HOST         ""
regler SMTP_PORT         587
regler SMTP_USER         ""
regler SMTP_PASS         ""
regler SMTP_SENDER_NAME  HERACLES
regler SMTP_ADMIN_EMAIL  "no-reply@$APP"

# ————— Identité de la pile —————
regler STUDIO_DEFAULT_ORGANIZATION HERACLES
regler STUDIO_DEFAULT_PROJECT      "$PILE"
regler POOLER_TENANT_ID            "$PILE"
# `postgres`, et pas autre chose : Supabase installe son socle — schéma
# `auth`, rôles, extensions — dans la base par défaut. Une base renommée naît
# vide, et le rôle `postgres` n'y a même pas les droits sur le schéma
# `public`. L'isolation ne vient pas du nom de la base : chaque pile a son
# conteneur et son volume, qui ne se croisent jamais.
regler POSTGRES_DB postgres

cat "$SORTIE"
