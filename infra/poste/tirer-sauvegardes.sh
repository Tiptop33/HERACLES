#!/bin/bash
# Tire les sauvegardes du serveur vers ce poste. À lancer SUR LE MAC.
#
#   ./tirer-sauvegardes.sh root@essai.oaf-heracles.cloud
#
# C'est la moitié qui manque à `infra/essai/sauvegarder.sh` : celui-ci écrit
# des archives sur le serveur, celui-là les met ailleurs. Tant que les deux
# n'ont pas tourné, il n'y a pas de sauvegarde — seulement une copie sur le
# disque qu'elle est censée protéger.
#
# La copie se TIRE, elle ne se pousse pas. Le serveur n'a aucun accès ici :
# une machine qui sait écrire chez vous est une machine qui peut, le jour où
# elle est prise, effacer chez vous.
#
# Écrit pour le bash de macOS, qui est resté en 3.2 : ni `mapfile`, ni
# `${x^^}`, ni tableaux associatifs. Ce script tourne aussi sous Linux.

set -u

CIBLE="${1:-}"
OU="${2:-$HOME/sauvegardes-heracles}"
DISTANT=/var/backups/heracles/
GARDER="${HERACLES_GARDER:-30}"

if [ -z "$CIBLE" ]; then
  echo "Usage : $0 <utilisateur@serveur> [dossier]" >&2
  echo "Exemple : $0 root@essai.oaf-heracles.cloud" >&2
  exit 2
fi

mkdir -p "$OU" || exit 1
JOURNAL="$OU/journal.txt"

dire() { printf '%s  %s\n' "$(date +%Y-%m-%dT%H:%M:%S)" "$*" | tee -a "$JOURNAL"; }

# Sur un poste, personne ne lit les journaux. Une sauvegarde qui échoue en
# silence pendant trois semaines ne se découvre que le jour où on en a besoin :
# on le dit à l'écran.
signaler() {
  niveau="$1"; shift
  dire "$niveau — $*"
  if [ -x /usr/bin/osascript ]; then
    /usr/bin/osascript -e "display notification \"$*\" with title \"Sauvegarde HERACLES\"" \
      >/dev/null 2>&1
  fi
}
alerter() { signaler "ÉCHEC" "$@"; }      # ce tirage-ci n'a rien donné
avertir() { signaler "ATTENTION" "$@"; }  # il a donné quelque chose, mais…

dire "— tirage depuis $CIBLE"

# `BatchMode=yes` : sans clé, on échoue tout de suite au lieu d'attendre un
# mot de passe que personne ne tapera — une tâche de fond n'a pas d'écran.
# Pas de `--delete` : le serveur ne garde que quatorze archives, ce poste en
# garde davantage. C'est tout l'intérêt d'être ailleurs.
if ! rsync -az --partial --timeout=600 \
     -e "ssh -o BatchMode=yes -o ConnectTimeout=20 -o StrictHostKeyChecking=accept-new" \
     "$CIBLE:$DISTANT" "$OU/" >> "$JOURNAL" 2>&1; then
  alerter "le tirage depuis $CIBLE n'a pas abouti. Voir $JOURNAL"
  exit 1
fi

# ————— Ce qui est arrivé —————
DERNIERE="$(ls -1 "$OU"/heracles-*.tar.gz 2>/dev/null | sort | tail -1)"
if [ -z "$DERNIERE" ]; then
  alerter "aucune archive sur ce poste après le tirage. Le serveur en produit-il ?"
  exit 1
fi

# Une archive qu'on n'ouvre jamais n'est qu'un fichier. On l'ouvre, à chaque
# fois : c'est quelques secondes, et c'est ce qui distingue une sauvegarde
# d'une intention.
if ! tar -tzf "$DERNIERE" >/dev/null 2>&1; then
  alerter "$(basename "$DERNIERE") est illisible. Ne comptez pas dessus."
  exit 1
fi

# Fraîcheur : l'horodatage vient du serveur, `rsync -a` le conserve. Plus de
# deux jours, c'est que la minuterie du serveur ne tourne plus.
if [ -z "$(find "$OU" -name 'heracles-*.tar.gz' -mtime -2 -print -quit 2>/dev/null)" ]; then
  avertir "la plus récente a plus de deux jours. La sauvegarde du serveur tourne-t-elle ?"
fi

dire "ok — $(basename "$DERNIERE") lisible"
tar -xzOf "$DERNIERE" ./MANIFESTE.txt 2>/dev/null \
  | sed -n '/Comptes au moment/,/^$/p' | sed 's/^/    /' | tee -a "$JOURNAL"

# ————— Le ménage —————
# Les noms portent la date : trier par nom, c'est trier par date. On garde les
# plus récents, sans avoir à interroger le système de fichiers — `stat` ne
# s'écrit pas pareil sur macOS et sur Linux.
ls -1 "$OU"/heracles-*.tar.gz 2>/dev/null | sort -r | tail -n +$((GARDER + 1)) \
  | while read -r vieille; do
      dire "retiré : $(basename "$vieille") (au-delà des $GARDER gardées)"
      rm -f "$vieille"
    done

COMBIEN="$(ls -1 "$OU"/heracles-*.tar.gz 2>/dev/null | wc -l | tr -d ' ')"
dire "$COMBIEN archive(s) sur ce poste, dans $OU"
