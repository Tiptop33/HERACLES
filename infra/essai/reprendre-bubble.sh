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
#   * `deployer.sh --repartir-de-zero` refuse désormais de s'exécuter — mais il
#     existe un moyen de passer outre, et il efface tout ;
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
#
# Les outils tournent dans un conteneur, et non sur la machine. Trois raisons :
# le VPS n'a pas forcément npm ; la version de Node y est ce qu'elle est ; et
# depuis le réseau de la pile, la base se joint par son nom — `db` — sans avoir
# à deviner une adresse ni à publier un port.

set -euo pipefail

FICHIERS=0
[[ "${1:-}" == "--fichiers" ]] && FICHIERS=1

DOSSIER=/opt/supabase-heracles-essai
PREFIXE=heracles-essai
RESEAU=heracles-essai_default
IMAGE=node:22-alpine
DEPOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

rouge() { printf '\033[31m%s\033[0m\n' "$*"; }
vert()  { printf '\033[32m%s\033[0m\n' "$*"; }
etape() { printf '\n\033[1m── %s\033[0m\n' "$*"; }

[[ $EUID -eq 0 ]] || { rouge "À lancer avec sudo."; exit 1; }
command -v docker >/dev/null || { rouge "docker est absent."; exit 1; }
[[ -f "$DOSSIER/.env" ]] || { rouge "L'instance d'essai n'est pas installée."; exit 1; }

etape "Vérifications"
MDP="$(grep -m1 '^POSTGRES_PASSWORD=' "$DOSSIER/.env" | cut -d= -f2-)"
[[ -n "$MDP" ]] || { rouge "POSTGRES_PASSWORD introuvable dans $DOSSIER/.env"; exit 1; }

docker exec "$PREFIXE-db" pg_isready -U postgres >/dev/null 2>&1 \
  || { rouge "La base ne répond pas."; exit 1; }

docker network inspect "$RESEAU" >/dev/null 2>&1 \
  || { rouge "Le réseau Docker « $RESEAU » n'existe pas."; exit 1; }

[[ -d "$DEPOT/outils" ]] || { rouge "$DEPOT/outils est introuvable."; exit 1; }
vert "base prête, réseau $RESEAU en place"

# Lance une commande Node dans un conteneur éphémère, sur le réseau de la pile.
# `db` et `kong` s'y joignent par leur nom : c'est Docker qui résout.
outil() {
  docker run --rm \
    --network "$RESEAU" \
    -v "$DEPOT/outils:/outils" \
    -w /outils \
    -e DATABASE_URL="postgres://postgres:$MDP@db:5432/postgres" \
    -e BUBBLE_TOKEN="${BUBBLE_TOKEN:-}" \
    "$@"
}

etape "Dépendances des outils"
# Une seule : `pg`. Installée dans le dossier monté, elle survit aux
# déploiements — `git clean` ne touche pas ce qui est ignoré.
if [[ ! -d "$DEPOT/outils/node_modules/pg" ]]; then
  outil "$IMAGE" sh -c 'npm install --omit=dev --no-audit --no-fund >/dev/null 2>&1'
  vert "pg installé"
else
  vert "déjà là"
fi

if [[ -z "${BUBBLE_TOKEN:-}" ]]; then
  echo
  echo "BUBBLE_TOKEN n'est pas renseigné. L'API répondra quand même — elle est"
  echo "ouverte à découvert — mais avec un jeton, c'est mieux :"
  echo "  BUBBLE_TOKEN=xxx sudo -E $0 ${1:-}"
fi

# ————— Passe 1 : les tables métier, base en service —————
etape "Tables métier — base en service"
outil "$IMAGE" node import-bubble.mjs

# ————— Passe 2 : les référentiels, base de l'éditeur —————
etape "Référentiels — base de l'éditeur"
echo "Les deux bases de Bubble n'exposent pas les mêmes types. On reprend ici"
echo "ce que la première ne donnait pas, sans toucher aux tables déjà remplies."
outil -e BUBBLE_VERSION=version-test -e SEULEMENT_BRUT=1 "$IMAGE" node import-bubble.mjs

# ————— Les fichiers, si on les a demandés —————
if [[ $FICHIERS -eq 1 ]]; then
  etape "Fichiers — du CDN de Bubble vers le stockage"
  echo "CV, lettres, photos et PDF. Reprenable : interrompu, relancé, il repart"
  echo "où il en était. C'est la seule étape qui doit être finie avant que"
  echo "l'application Bubble ferme — ensuite, ces adresses ne répondront plus."

  CLE="$(grep -m1 '^SERVICE_ROLE_KEY=' "$DOSSIER/.env" | cut -d= -f2-)"
  [[ -n "$CLE" ]] || { rouge "SERVICE_ROLE_KEY introuvable dans $DOSSIER/.env"; exit 1; }

  # Kong par son nom, depuis le réseau : le dépôt ne ressort pas sur Internet
  # pour y revenir. Seul le téléchargement chez Bubble sort.
  outil -e SUPABASE_URL="http://kong:8000" \
        -e SUPABASE_SERVICE_ROLE_KEY="$CLE" \
        "$IMAGE" node rapatrier-fichiers.mjs
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

  1. `deployer.sh --repartir-de-zero` refuse de s'exécuter tant que la base
     contient des candidats. Il dit comment sauvegarder, et comment passer
     outre — ce qui efface tout.

  2. Une sauvegarde devient nécessaire — base, fichiers et de quoi vérifier :
       sudo /opt/heracles-essai-depot/infra/essai/installer-sauvegarde.sh
     Elle en prend une tout de suite, puis chaque nuit. Reste à en tirer une
     copie depuis votre poste : une sauvegarde qui ne quitte pas la machine
     qu'elle protège n'en est pas une. Voir docs/sauvegarde.md.

  3. L'API Bubble répond toujours sans jeton. Les mêmes données sont désormais
     à deux endroits ; il n'y a plus de raison de laisser la première ouverte.

FIN
