#!/usr/bin/env bash
# Sauvegarde l'instance d'ESSAI : la base, les fichiers, et de quoi vérifier.
#
#   sudo ./infra/essai/sauvegarder.sh
#   sudo ./infra/essai/sauvegarder.sh --garder 30
#
# Produit une archive par exécution dans /var/backups/heracles, et ne garde que
# les dernières. Rien n'est écrit dans le dépôt : une sauvegarde contient des
# données réelles, elle n'a rien à faire sous git.
#
# ─────────────────────────────────────────────────────────────────────────────
# CE QUE CETTE ARCHIVE CONTIENT, ET CE QU'ELLE NE CONTIENT PAS
#
# Dedans : toute la base — 107 candidats, leurs parcours, leurs coordonnées —
# et tous les fichiers déposés. C'est une copie intégrale de données
# personnelles. Elle se traite comme telle : lisible par root seul, jamais sur
# un partage ouvert, jamais dans un dépôt.
#
# Dehors : les secrets de la pile (`.env`). Ils ne changent pas d'un jour à
# l'autre et n'ont pas leur place dans une archive qui circule. Ils se copient
# une fois, dans un gestionnaire de mots de passe — voir `--avec-secrets`.
#
# Et surtout : cette archive reste sur la machine qu'elle protège. **Ce n'est
# pas encore une sauvegarde.** Elle le devient quand une copie en sort. Le
# script dit comment, à la fin, et `installer-sauvegarde.sh` l'automatise.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

DOSSIER=/opt/supabase-heracles-essai
PREFIXE=heracles-essai
OU=/var/backups/heracles
GARDER=14
SECRETS=0

rouge() { printf '\033[31m%s\033[0m\n' "$*"; }
vert()  { printf '\033[32m%s\033[0m\n' "$*"; }
etape() { printf '\n\033[1m── %s\033[0m\n' "$*"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --garder)        GARDER="${2:?--garder attend un nombre}"; shift 2 ;;
    --avec-secrets)  SECRETS=1; shift ;;
    --ou)            OU="${2:?--ou attend un chemin}"; shift 2 ;;
    *) rouge "Option inconnue : $1"; exit 1 ;;
  esac
done

[[ $EUID -eq 0 ]] || { rouge "À lancer avec sudo."; exit 1; }
command -v docker >/dev/null || { rouge "docker est absent."; exit 1; }
[[ -f "$DOSSIER/.env" ]] || { rouge "L'instance d'essai n'est pas installée."; exit 1; }

docker exec "$PREFIXE-db" pg_isready -U postgres >/dev/null 2>&1 \
  || { rouge "La base ne répond pas — rien à sauvegarder d'utile."; exit 1; }

# Le nom de la base vient de la pile, pas d'une constante écrite ici : c'est
# `.env` qui fait foi, comme pour `mettre-a-jour.sh`.
BASE="$(grep -m1 '^POSTGRES_DB=' "$DOSSIER/.env" | cut -d= -f2- || true)"
BASE="${BASE:-postgres}"

# Jusqu'aux secondes : deux sauvegardes prises coup sur coup — avant une
# opération, puis après — ne doivent pas s'écraser l'une l'autre.
QUAND="$(date +%Y-%m-%d-%H%M%S)"
TRAVAIL="$(mktemp -d)"
MANIFESTE="$(mktemp)"
ARCHIVE="$OU/heracles-$QUAND.tar.gz"
trap 'rm -rf "$TRAVAIL" "$MANIFESTE"' EXIT

mkdir -p "$OU"
chmod 700 "$OU"

# La place restante, avant d'écrire : une sauvegarde qui remplit le disque
# arrête l'application qu'elle protégeait.
LIBRE_KO="$(df -Pk "$OU" | awk 'NR==2 {print $4}')"
if [[ "$LIBRE_KO" -lt 1048576 ]]; then
  rouge "Moins d'un gigaoctet de libre sur $OU. Faites de la place d'abord."
  echo  "Les plus anciennes archives sont ici :"
  ls -1t "$OU" 2>/dev/null | tail -5 | sed 's/^/  /'
  exit 1
fi

# ————— Les rôles —————
etape "Les rôles"
# À part, et sans les mots de passe. Deux raisons : une archive qui circule n'a
# pas à porter des empreintes de mots de passe, et sur une pile déjà installée
# les rôles existent — c'est Supabase qui les crée depuis son `.env`. Ce
# fichier-ci est le filet pour une machine neuve.
docker exec -i "$PREFIXE-db" pg_dumpall -U postgres --roles-only --no-role-passwords \
  | gzip -9 > "$TRAVAIL/roles.sql.gz"
gzip -t "$TRAVAIL/roles.sql.gz" \
  || { rouge "Le fichier des rôles est illisible. Sauvegarde abandonnée."; exit 1; }
vert "rôles : $(du -h "$TRAVAIL/roles.sql.gz" | cut -f1)"

# ————— La base —————
etape "La base"
# Une seule base, celle de l'application : elle porte tous les schémas qui
# comptent — `public`, `auth`, `storage`, `realtime`. La base interne de
# Supabase, elle, se reconstruit toute seule au démarrage de la pile.
#
# `--clean --if-exists` : le fichier commence par défaire ce qu'il va refaire,
# et se rejoue donc sur une base non vide sans laisser de moitiés.
docker exec -i "$PREFIXE-db" pg_dump -U postgres -d "$BASE" --clean --if-exists \
  | gzip -9 > "$TRAVAIL/base.sql.gz"

gzip -t "$TRAVAIL/base.sql.gz" \
  || { rouge "Le fichier de la base est illisible. Sauvegarde abandonnée."; exit 1; }
vert "base : $(du -h "$TRAVAIL/base.sql.gz" | cut -f1)"

# ————— Les fichiers déposés —————
etape "Les fichiers"
# CV, lettres, photos, PDF : ils ne sont pas dans la base, mais sur le disque.
# Une sauvegarde sans eux laisserait 107 fiches sans une pièce jointe.
if [[ -d "$DOSSIER/volumes/storage" ]]; then
  tar -czf "$TRAVAIL/stockage.tar.gz" -C "$DOSSIER/volumes" storage
  tar -tzf "$TRAVAIL/stockage.tar.gz" >/dev/null \
    || { rouge "L'archive des fichiers est illisible. Sauvegarde abandonnée."; exit 1; }
  vert "fichiers : $(du -h "$TRAVAIL/stockage.tar.gz" | cut -f1)"
else
  echo "aucun stockage sur disque — rien à joindre"
fi

# ————— Les secrets, seulement si on les demande —————
if [[ $SECRETS -eq 1 ]]; then
  etape "Les secrets"
  echo "Le JWT de la pile est dedans : sans lui, les clés de l'application ne"
  echo "correspondent plus à rien. Cette archive-ci ne se laisse pas traîner."
  cp "$DOSSIER/.env" "$TRAVAIL/env-supabase"
  [[ -f /opt/heracles-essai-depot/.env.essai ]] \
    && cp /opt/heracles-essai-depot/.env.essai "$TRAVAIL/env-application"
fi

# ————— De quoi vérifier —————
# Le manifeste s'écrit hors du dossier de travail, puis y entre : sans quoi il
# prendrait sa propre empreinte, en cours d'écriture.
etape "Ce que l'archive contient"
{
  echo "HERACLES — sauvegarde de l'instance d'essai"
  echo "Prise le : $(date -Is)"
  echo "Machine  : $(hostname)"
  echo "Base     : $BASE"
  echo "Version  : $(git -C /opt/heracles-essai-depot rev-parse --short HEAD 2>/dev/null || echo inconnue)"
  echo "Secrets  : $([[ $SECRETS -eq 1 ]] && echo oui || echo non)"
  echo
  echo "Comptes au moment de la prise —"
  docker exec -i "$PREFIXE-db" psql -U postgres -d postgres -tA -F' : ' -c "
    select 'candidat', count(*) from public.candidat
    union all select 'referent', count(*) from public.referent
    union all select 'loge', count(*) from public.loge
    union all select 'offre_emploi', count(*) from public.offre_emploi
    union all select 'document', count(*) from public.document
    union all select 'comptes', count(*) from auth.users
    order by 1" | sed 's/^/  /'
  echo
  echo "Empreintes —"
  ( cd "$TRAVAIL" && sha256sum -- * | sed 's/^/  /' )
} > "$MANIFESTE"

cp "$MANIFESTE" "$TRAVAIL/MANIFESTE.txt"
sed -n '/Comptes au moment/,/^$/p' "$TRAVAIL/MANIFESTE.txt"

tar -czf "$ARCHIVE" -C "$TRAVAIL" .
chmod 600 "$ARCHIVE"
tar -tzf "$ARCHIVE" >/dev/null \
  || { rouge "L'archive finale est illisible."; rm -f "$ARCHIVE"; exit 1; }

# ————— Le ménage —————
# `ls -t` puis `tail` : on ne garde que les N plus récentes. Le tri par nom
# donnerait le même ordre — les noms portent la date — mais l'horodatage ne
# ment pas si un fichier a été recopié.
mapfile -t VIEILLES < <(ls -1t "$OU"/heracles-*.tar.gz 2>/dev/null | tail -n +$((GARDER + 1)))
if [[ ${#VIEILLES[@]} -gt 0 ]]; then
  printf '%s\n' "${VIEILLES[@]}" | xargs -r rm -f
  echo "${#VIEILLES[@]} archive(s) plus ancienne(s) que les $GARDER dernières supprimée(s)"
fi

etape "C'est écrit"
vert "$ARCHIVE  ($(du -h "$ARCHIVE" | cut -f1))"
echo "$(ls -1 "$OU"/heracles-*.tar.gz 2>/dev/null | wc -l) archive(s) en tout dans $OU"

cat <<FIN

  ⚠  Cette archive est encore sur la machine qu'elle protège. Tant qu'elle n'en
     sort pas, un disque perdu emporte les deux.

     Depuis VOTRE poste — et non depuis le serveur, qui n'a ainsi aucun accès
     chez vous :

       scp root@<le-serveur>:$ARCHIVE ~/sauvegardes-heracles/

     Puis vérifiez, sur votre poste :

       tar -tzf ~/sauvegardes-heracles/$(basename "$ARCHIVE") | head

  Pour que cela se fasse tout seul, chaque nuit :
     sudo /opt/heracles-essai-depot/infra/essai/installer-sauvegarde.sh

FIN
