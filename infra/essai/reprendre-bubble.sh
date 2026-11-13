#!/usr/bin/env bash
# Rejoue la reprise Bubble vers l'instance d'ESSAI, puis rapatrie les fichiers.
#
#   sudo ./infra/essai/reprendre-bubble.sh                    # les données
#   sudo ./infra/essai/reprendre-bubble.sh --fichiers         # et les fichiers
#   sudo ./infra/essai/reprendre-bubble.sh --pdf-commission   # les PDF seuls
#   sudo ./infra/essai/reprendre-bubble.sh --dates-candidats  # une date seule
#   BUBBLE_TOKEN=xxx sudo -E ./infra/essai/reprendre-bubble.sh --provinces
#   sudo ./infra/essai/reprendre-bubble.sh --loges-du-reseau  # les 73 loges du réseau
#
# `--loges-du-reseau` ne reprend que le type Bubble `loges`, en réserve brute,
# puis pose dans Paramètres › Loges du réseau celles que Bubble rattache à la
# loge HERACLES — nom, numéro, province, adresse, écusson (migration 0094).
# Rien de ce que l'administration a saisi n'est remplacé, et une loge qu'elle
# a retirée ne revient pas. Sans jeton : Bubble montre ce type à l'API
# anonyme. `mettre-a-jour.sh` le joue à chaque mise en ligne, jusqu'à la
# bascule.
#
# `--provinces` ne reprend que les provinces — nom et écusson — et rattache
# les loges (migrations 0080, 0081). Jeton obligatoire : Bubble cache ce type
# à l'API anonyme. Le jeton vient de la commande, ou à défaut de la ligne
# `BUBBLE_TOKEN=` du `.env` de la pile. Rangé là, `mettre-a-jour.sh` le joue
# à chaque mise en ligne, jusqu'à la bascule. Sans jeton, il s'arrête sur le
# code 3 — « rien à faire », et non une panne. Si la base en service refuse
# le jeton, il lit la base de test à la place, et le dit.
#
# `--pdf-commission` ne reprend que la table des PDF de Bubble, et ne rapatrie
# que les comptes rendus, affiches et affichettes — ni candidat, ni référent,
# ni CV. `mettre-a-jour.sh` le joue à chaque mise en ligne, jusqu'à la bascule :
# l'accueil (migration 0069) les montre et les ouvre depuis notre stockage.
#
# `--dates-candidats` ne recopie que la date de dernière modification de
# chaque fiche dans Bubble (`bubble_modifie_le`, migration 0071), sur les
# candidats déjà repris : aucune autre colonne, aucune fiche nouvelle. C'est
# la date approchée de clôture ou d'archivage des dossiers repris. Joué aussi à
# chaque mise en ligne, jusqu'à la bascule.
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
PDF_COMMISSION=0
DATES_CANDIDATS=0
PROVINCES=0
LOGES_DU_RESEAU=0
case "${1:-}" in
  "") ;;
  --fichiers) FICHIERS=1 ;;
  --pdf-commission) PDF_COMMISSION=1 ;;
  --dates-candidats) DATES_CANDIDATS=1 ;;
  --provinces) PROVINCES=1 ;;
  --loges-du-reseau) LOGES_DU_RESEAU=1 ;;
  *) printf 'Option inconnue : %s\n' "$1" >&2; exit 1 ;;
esac

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

# ————— La date de modification Bubble des candidats, et rien d'autre —————
if [[ $DATES_CANDIDATS -eq 1 ]]; then
  etape "Dates de modification des candidats — depuis la base en service"
  # Une seule colonne, sur les fiches déjà reprises. Le reste de la fiche, et
  # ce qu'HERACLES y a changé, n'est pas touché.
  outil -e SEULEMENT_TYPES=candidats -e SEULEMENT_CHAMPS=bubble_modifie_le \
        "$IMAGE" node import-bubble.mjs

  etape "Dates — bilan"
  docker exec -i "$PREFIXE-db" psql -U postgres -d postgres -c "
    select count(*) filter (where bubble_id is not null)        as repris_de_bubble,
           count(bubble_modifie_le)                              as date_bubble_connue,
           count(*) filter (where public.mot_de_fermeture(cloture) is not null
                              and public.mot_de_fermeture(archive) is null) as clotures_non_archives
      from public.candidat"
  exit 0
fi

# ————— Les provinces, et rien d'autre —————
if [[ $PROVINCES -eq 1 ]]; then
  # Une règle de confidentialité de Bubble cache les provinces à l'API sans
  # jeton : chaque fiche répond, mais réduite à son identifiant — ni nom, ni
  # écusson. Sans jeton, cette reprise n'apporterait rien ; on refuse plutôt
  # que de finir en vert sur des cartes vides.
  #
  # Le jeton de la commande d'abord ; sinon celui rangé dans le `.env` de la
  # pile, qui permet à chaque mise en ligne de rejouer cette reprise. Il ne
  # sert qu'ici : les PDF et les dates se reprennent sans lui aujourd'hui, et
  # un jeton refusé les ferait échouer — `mettre-a-jour.sh` les lance donc
  # sans (`env -u BUBBLE_TOKEN`), bien qu'il charge tout le `.env`.
  if [[ -z "${BUBBLE_TOKEN:-}" ]]; then
    BUBBLE_TOKEN="$(grep -m1 '^BUBBLE_TOKEN=' "$DOSSIER/.env" 2>/dev/null | cut -d= -f2- || true)"
  fi
  # Ce qu'un éditeur de texte a pu ajouter autour : guillemets, retour chariot
  # d'un fichier passé par Windows. Aussi quand le jeton arrive déjà chargé
  # par `mettre-a-jour.sh`, qui lit le `.env` sans ce nettoyage.
  BUBBLE_TOKEN="${BUBBLE_TOKEN:-}"
  BUBBLE_TOKEN="${BUBBLE_TOKEN%$'\r'}"
  BUBBLE_TOKEN="${BUBBLE_TOKEN#\"}"; BUBBLE_TOKEN="${BUBBLE_TOKEN%\"}"
  BUBBLE_TOKEN="${BUBBLE_TOKEN#\'}"; BUBBLE_TOKEN="${BUBBLE_TOKEN%\'}"
  if [[ -z "${BUBBLE_TOKEN:-}" ]]; then
    rouge "BUBBLE_TOKEN est obligatoire pour les provinces."
    echo  "Bubble les cache à l'API sans jeton (règle de confidentialité du type"
    echo  "« provinces ») : on n'obtiendrait que des identifiants. Le jeton se crée"
    echo  "dans l'éditeur Bubble, Settings → API → API Tokens. Puis, au choix :"
    echo  "  BUBBLE_TOKEN=xxx sudo -E $0 --provinces          # une fois"
    echo  "  une ligne BUBBLE_TOKEN=xxx dans $DOSSIER/.env  # à chaque mise en ligne"
    exit 3
  fi

  etape "Provinces — la réserve brute, depuis la base en service"
  # Le type `provinces`, seul, recopié dans bubble_brut. Les tables métier et
  # les autres types de la réserve ne sont pas touchés.
  #
  # Les réglages d'API de Bubble sont versionnés : un jeton créé dans l'éditeur
  # n'est reconnu par la base en service qu'une fois Bubble déployé en Live.
  # Déployer Bubble pousserait aussi en Live tout ce qui attend dans l'éditeur ;
  # on ne le fait pas pour deux fiches (décision du 12 novembre 2026). Si la
  # base en service refuse le jeton — code 4, rien d'écrit —, on lit donc les
  # provinces dans la base de test, où le jeton vaut tout de suite. Ce sont les
  # mêmes provinces, aux mêmes identifiants : les loges en service les
  # désignent. Le bilan dit d'où elles viennent. Le jour où la base en service
  # accepte le jeton, c'est elle qui fait foi, sans rien changer ici.
  SOURCE="base en service"
  code=0
  outil -e TYPES_BRUTS=provinces "$IMAGE" node import-bubble.mjs || code=$?
  if [[ $code -eq 4 ]]; then
    rouge "La base en service refuse le jeton (Bubble pas déployé depuis sa création, ou jeton mal recopié)."
    etape "Provinces — la réserve brute, depuis la base de TEST (repli)"
    SOURCE="base de test (version-test) — repli, jeton refusé par la base en service"
    outil -e TYPES_BRUTS=provinces -e BUBBLE_VERSION=version-test "$IMAGE" node import-bubble.mjs
  elif [[ $code -ne 0 ]]; then
    exit "$code"
  fi

  etape "Provinces — dépliées dans leur table, loges rattachées"
  docker exec -i "$PREFIXE-db" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "
    select * from public.deverser_provinces_bubble()"

  etape "Provinces — les écussons, du CDN de Bubble vers le stockage"
  CLE="$(grep -m1 '^SERVICE_ROLE_KEY=' "$DOSSIER/.env" | cut -d= -f2-)"
  [[ -n "$CLE" ]] || { rouge "SERVICE_ROLE_KEY introuvable dans $DOSSIER/.env"; exit 1; }
  outil -e SUPABASE_URL="http://kong:8000" \
        -e SUPABASE_SERVICE_ROLE_KEY="$CLE" \
        -e SEULEMENT=provinces \
        "$IMAGE" node rapatrier-fichiers.mjs

  etape "Provinces — bilan"
  # Une carte sans nom ou sans écusson se voit ici, avant de se voir à l'écran.
  echo "Lues dans : $SOURCE"
  docker exec -i "$PREFIXE-db" psql -U postgres -d postgres -c "
    select count(*)            as provinces,
           count(nom)          as avec_nom,
           count(image_url)    as avec_ecusson,
           count(image_chemin) as ecusson_dans_le_stockage,
           (select count(*) from public.loge where province_id is not null) as loges_rattachees
      from public.province
     where bubble_id is not null"
  exit 0
fi

# ————— Les loges du réseau, et rien d'autre —————
if [[ $LOGES_DU_RESEAU -eq 1 ]]; then
  etape "Loges du réseau — la réserve brute, depuis la base en service"
  # Le type `loges` seul — les 1 389 loges de l'annuaire —, recopié dans
  # bubble_brut. La base en service, et non celle de l'éditeur : celle-ci n'a
  # que 39 des 73 loges du réseau (relevé du 13 novembre 2026).
  outil -e TYPES_BRUTS=loges "$IMAGE" node import-bubble.mjs

  etape "Loges du réseau — posées dans Paramètres › Loges du réseau"
  # Celles que Bubble rattache à la loge HERACLES. Créées, rattachées à une
  # loge saisie au même numéro, ou complétées là où une case est vide ; jamais
  # remplacées. « laissees » : sans nom, retirées par l'administration, ou un
  # numéro déjà pris par une autre loge.
  docker exec -i "$PREFIXE-db" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "
    select * from public.deverser_loges_du_reseau_bubble()"

  etape "Loges du réseau — les écussons, du CDN de Bubble vers le stockage"
  CLE="$(grep -m1 '^SERVICE_ROLE_KEY=' "$DOSSIER/.env" | cut -d= -f2-)"
  [[ -n "$CLE" ]] || { rouge "SERVICE_ROLE_KEY introuvable dans $DOSSIER/.env"; exit 1; }
  outil -e SUPABASE_URL="http://kong:8000" \
        -e SUPABASE_SERVICE_ROLE_KEY="$CLE" \
        -e SEULEMENT=loges-du-reseau \
        "$IMAGE" node rapatrier-fichiers.mjs

  etape "Loges du réseau — bilan"
  # Des nombres, jamais un nom ni une adresse.
  docker exec -i "$PREFIXE-db" psql -U postgres -d postgres -c "
    select count(*)                 as loges_du_reseau,
           count(bubble_id)         as reprises_de_bubble,
           count(province_id)       as avec_province,
           count(secretaire_email)  as avec_adresse,
           count(secretaire_nom)    as avec_secretaire,
           count(ecusson_chemin)    as avec_ecusson,
           count(*) filter (where ecusson_url is not null and ecusson_chemin is null) as ecussons_a_rapatrier
      from public.loge_du_reseau"
  exit 0
fi

# ————— Les PDF de la commission, et rien d'autre —————
if [[ $PDF_COMMISSION -eq 1 ]]; then
  etape "PDF de la commission — la table, depuis la base en service"
  # Les 179 lignes de `pdfs` (CV anonymes compris : la table est reprise telle
  # quelle, comme par MAJBUBBLE). Un PDF effacé depuis l'accueil le reste :
  # l'upsert ne touche pas à `efface_le`.
  outil -e SEULEMENT_TYPES=pdfs "$IMAGE" node import-bubble.mjs

  etape "PDF de la commission — les fichiers, du CDN de Bubble vers le stockage"
  CLE="$(grep -m1 '^SERVICE_ROLE_KEY=' "$DOSSIER/.env" | cut -d= -f2-)"
  [[ -n "$CLE" ]] || { rouge "SERVICE_ROLE_KEY introuvable dans $DOSSIER/.env"; exit 1; }
  outil -e SUPABASE_URL="http://kong:8000" \
        -e SUPABASE_SERVICE_ROLE_KEY="$CLE" \
        -e SEULEMENT=pdf-commission \
        "$IMAGE" node rapatrier-fichiers.mjs

  etape "PDF de la commission — bilan"
  # Des nombres, jamais un nom : la table porte des comptes rendus.
  docker exec -i "$PREFIXE-db" psql -U postgres -d postgres -c "
    select lower(btrim(type_document))                      as sorte,
           count(*)                                         as repris_de_bubble,
           count(chemin)                                    as dans_le_stockage,
           count(*) filter (where chemin is null and efface_le is null) as restants,
           count(*) filter (where efface_le is not null)    as effaces
      from public.document
     where bubble_id is not null
       and lower(btrim(type_document)) in ('compte-rendu', 'affiche', 'affichette')
     group by 1
     order by 1"
  exit 0
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

# ————— Passe 3 : les tâches, dépliées dans le journal —————
etape "Tâches — de la réserve brute vers le journal des candidats"
echo "Le type « tache » de Bubble n'a pas de table à lui : il arrive en JSON dans"
echo "bubble_brut, d'où la migration 0023 le déplie — un candidat, un auteur, un"
echo "jour, un état. Rejouable : une tâche déjà déversée est mise à jour."
docker exec -i "$PREFIXE-db" psql -U postgres -d postgres -c "
  select * from public.deverser_taches_bubble()"

# ————— Passe 4 : les réunions et leurs appels —————
etape "Réunions — de la réserve brute vers le registre"
echo "Même cas que les tâches : le type « reunion » de Bubble n'a pas de table à"
echo "lui, il arrive en JSON dans bubble_brut. La migration 0036 le déplie en"
echo "réunions et en pointages — la liste « referent » donne les présents,"
echo "« EXCUSE » les excusés. Rejouable : une réunion déjà déversée est mise à"
echo "jour, jamais dupliquée, et son retrait éventuel est préservé."
docker exec -i "$PREFIXE-db" psql -U postgres -d postgres -c "
  select * from public.deverser_reunions_bubble()"

# ————— Passe 5 : les provinces, et le rattachement des loges —————
etape "Provinces — de la réserve brute vers leur table"
echo "Même cas encore : le type « PROVINCE » n'est exposé que par la base de"
echo "l'éditeur, il arrive en JSON dans bubble_brut. La migration 0080 le déplie"
echo "— un nom, une image — puis rattache chaque loge à sa province."
echo "« sans_nom » ou « sans_image » non nuls : un champ n'a pas été reconnu,"
echo "sa clé exacte se lit dans bubble_brut (type_bubble = 'province')."
docker exec -i "$PREFIXE-db" psql -U postgres -d postgres -c "
  select * from public.deverser_provinces_bubble()"

# ————— Passe 6 : les secteurs repris de Bubble —————
etape "Secteurs — la correspondance Bubble → nomenclature, appliquée aux fiches"
echo "Les fiches gardent leurs champs Bubble (liste ROME, texte libre, code NAF) ;"
echo "la migration 0093 en tire leurs secteurs : le code NAF d'office, la liste"
echo "ROME et le texte selon les correspondances validées dans Paramètres ›"
echo "Secteurs d'activité. Une fiche dont un référent a confirmé ou corrigé les"
echo "secteurs n'est pas touchée. Rejouable : le nombre rendu est celui des"
echo "fiches qui ont changé."
docker exec -i "$PREFIXE-db" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "
  select public.appliquer_les_secteurs_bubble() as fiches_changees"

# ————— Passe 7 : les loges du réseau —————
etape "Loges du réseau — de la réserve brute vers Paramètres › Loges du réseau"
echo "Les loges que Bubble rattache à la loge HERACLES (migration 0094) : créées,"
echo "ou complétées là où une case est vide. Ce que l'administration a saisi"
echo "reste ; une loge qu'elle a retirée ne revient pas. Leurs écussons suivent"
echo "avec --fichiers, ou avec --loges-du-reseau."
docker exec -i "$PREFIXE-db" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "
  select * from public.deverser_loges_du_reseau_bubble()"

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
  union all select 'suivi', count(*) from public.suivi
  union all select 'reunion', count(*) from public.reunion
  union all select 'appel', count(*) from public.appel
  union all select 'province', count(*) from public.province
  union all select 'candidat_secteur', count(*) from public.candidat_secteur
  union all select 'loge_du_reseau', count(*) from public.loge_du_reseau
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
