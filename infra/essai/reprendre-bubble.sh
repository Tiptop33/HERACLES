#!/usr/bin/env bash
# Rejoue la reprise Bubble vers l'instance d'ESSAI, puis rapatrie les fichiers.
#
#   sudo ./infra/essai/reprendre-bubble.sh                 # les données
#   sudo ./infra/essai/reprendre-bubble.sh --fichiers      # et les fichiers
#
# ─────────────────────────────────────────────────────────────────────────────
# CE QUE CETTE COMMANDE FAIT ENTRER SUR LE SERVEUR
#
# Des données réelles : 107 candidats avec leurs coordonnées, leurs parcours et
# leurs CV, 71 référents, 4 539 offres, 135 documents. L'instance d'essai avait
# été montée vide exprès. Ce n'est plus le cas après ceci, et trois choses en
# découlent :
#
#   * `deployer.sh --repartir-de-zero` EFFACE tout cela sans confirmation ;
#   * la sauvegarde du VPS devient une obligation, pas un confort ;
#   * l'API Bubble, tant qu'elle répond sans jeton, reste la porte la plus
#     large — la refermer devient plus urgent, pas moins.
#
# C'est une décision d'exploitation, prise en connaissance de cause.
# ─────────────────────────────────────────────────────────────────────────────
#
# Deux passes, comme la reprise du 4 août :
#   1. les tables métier depuis la base **en service** (les vraies données) ;
#   2. les référentiels depuis la base de **l'éditeur**, en `SEULEMENT_BRUT=1`
#      pour que la seconde n'écrase pas la première. Les deux bases de Bubble
#      n'exposent pas les mêmes types.
#
# Rejouable : une fiche déjà reprise est mise à jour, jamais dupliquée.

set -euo pipefail

FICHIERS=0
[[ "${1:-}" == "--fichiers" ]] && FICHIERS=1

DOSSIER=/opt/supabase-heracles-essai
PREFIXE=heracles-essai
DEPOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

rouge() { printf '\033[31m%s\033[0m\n' "$*"; }
vert()  { printf '\033[32m%s\033[0m\n' "$*"; }
etape() { printf '\n\033[1m── %s\033[0m\n' "$*"; }

[[ $EUID -eq 0 ]] || { rouge "À lancer avec sudo."; exit 1; }
command -v node >/dev/null || { rouge "node est absent."; exit 1; }
command -v npm  >/dev/null || { rouge "npm est absent."; exit 1; }
[[ -f "$DOSSIER/.env" ]] || { rouge "L'instance d'essai n'est pas installée."; exit 1; }

# ————— Joindre la base —————
etape "Connexion à la base"
# shellcheck disable=SC1091
MDP="$(grep -m1 '^POSTGRES_PASSWORD=' "$DOSSIER/.env" | cut -d= -f2-)"
[[ -n "$MDP" ]] || { rouge "POSTGRES_PASSWORD introuvable dans $DOSSIER/.env"; exit 1; }

# PostgreSQL n'est publié sur aucun port — c'est voulu. On passe donc par
# l'adresse du conteneur sur le réseau Docker, que l'hôte sait joindre.
IP="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$PREFIXE-db" 2>/dev/null || true)"
[[ -n "$IP" ]] || { rouge "Le conteneur $PREFIXE-db ne répond pas."; exit 1; }

export DATABASE_URL="postgres://postgres:$MDP@$IP:5432/postgres"

if ! docker exec "$PREFIXE-db" pg_isready -U postgres >/dev/null 2>&1; then
  rouge "La base ne répond pas."
  exit 1
fi
vert "base jointe sur $IP"

# ————— De quoi faire tourner les outils —————
if [[ ! -d "$DEPOT/outils/node_modules/pg" ]]; then
  etape "Dépendances des outils"
  ( cd "$DEPOT/outils" && npm ci --omit=dev --no-audit --no-fund >/dev/null 2>&1 \
      || npm install --omit=dev --no-audit --no-fund >/dev/null 2>&1 )
  vert "installées"
fi

if [[ -z "${BUBBLE_TOKEN:-}" ]]; then
  echo
  echo "BUBBLE_TOKEN n'est pas renseigné. L'API répondra quand même — elle est"
  echo "ouverte à découvert — mais avec un jeton, c'est mieux :"
  echo "  BUBBLE_TOKEN=xxx sudo -E $0 ${1:-}"
fi

# ————— Passe 1 : les tables métier, base en service —————
etape "Tables métier — base en service"
( cd "$DEPOT/outils" && node import-bubble.mjs )

# ————— Passe 2 : les référentiels, base de l'éditeur —————
etape "Référentiels — base de l'éditeur"
echo "Les deux bases de Bubble n'exposent pas les mêmes types. On reprend ici"
echo "ce que la première ne donnait pas, sans toucher aux tables déjà remplies."
( cd "$DEPOT/outils" && BUBBLE_VERSION=version-test SEULEMENT_BRUT=1 node import-bubble.mjs )

# ————— Les fichiers, si on les a demandés —————
if [[ $FICHIERS -eq 1 ]]; then
  etape "Fichiers — du CDN de Bubble vers le stockage"
  echo "CV, lettres, photos et PDF. Reprenable : interrompu, relancé, il repart"
  echo "où il en était. C'est la seule étape qui doit être finie avant que"
  echo "l'application Bubble ferme — ensuite, ces adresses ne répondront plus."
  CLE="$(grep -m1 '^SERVICE_ROLE_KEY=' "$DOSSIER/.env" | cut -d= -f2-)"
  API="$(grep -m1 '^SUPABASE_PUBLIC_URL=' "$DOSSIER/.env" | cut -d= -f2-)"
  [[ -n "$CLE" && -n "$API" ]] || { rouge "SERVICE_ROLE_KEY ou SUPABASE_PUBLIC_URL manque."; exit 1; }
  ( cd "$DEPOT/outils" && SUPABASE_URL="$API" SUPABASE_SERVICE_ROLE_KEY="$CLE" \
      node rapatrier-fichiers.mjs )
fi

# ————— Ce qui est arrivé —————
etape "Ce que la base contient maintenant"
docker exec -i "$PREFIXE-db" psql -U postgres -d postgres -c "
  select 'candidat' as table_, count(*) from public.candidat
  union all select 'referent', count(*) from public.referent
  union all select 'loge', count(*) from public.loge
  union all select 'offre_emploi', count(*) from public.offre_emploi
  union all select 'document', count(*) from public.document
  union all select 'bubble_brut', count(*) from public.bubble_brut
  order by 1"

cat <<'FIN'

  Trois choses ont changé, maintenant que le serveur porte des données réelles.

  1. `deployer.sh --repartir-de-zero` les effacerait sans rien demander.
     Ne l'employez plus sur cette instance sans sauvegarde préalable.

  2. Une sauvegarde devient nécessaire. Le plus simple, en attendant mieux :
       docker exec heracles-essai-db pg_dump -U postgres postgres | gzip > /root/heracles-$(date +%F).sql.gz
     À sortir du VPS : une sauvegarde qui reste sur la machine qu'elle protège
     n'en est pas une.

  3. L'API Bubble répond toujours sans jeton. Les mêmes données sont désormais
     à deux endroits ; il n'y a plus de raison de laisser la première ouverte.

FIN
