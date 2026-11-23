#!/usr/bin/env bash
# Reçoit les offres d'emploi de France Travail dans l'instance d'ESSAI.
#
#   sudo ./infra/essai/recevoir-offres.sh            # depuis la dernière offre connue
#   sudo ./infra/essai/recevoir-offres.sh --jours 31 # tout le mois écoulé
#
# Ne fait qu'appeler la route `/api/offres/recevoir` de l'application, sur la
# boucle locale, avec le secret rangé dans `.env.essai`. C'est l'application
# qui interroge France Travail et range les offres (docs/france-travail.md) :
# ce script n'a ni identifiant France Travail en main, ni accès à la base.
#
# La route s'arrête d'elle-même au bout de quatre minutes et dit si elle a
# fini, et jusqu'où elle est allée. Tant qu'elle n'a pas fini, on la rappelle
# en lui disant où reprendre — dix fois au plus : une première réception d'un
# mois entier passe en quelques appels.
#
# Codes de sortie :
#   0  les offres sont à jour
#   3  rien à faire : la réception n'est pas configurée (ce n'est pas une panne)
#   1  la réception a échoué — la sortie dit à quelle étape
#
# Appelé par la minuterie `heracles-offres.timer` (installer-reception-offres.sh)
# et par `mettre-a-jour.sh` à chaque mise en ligne.

set -euo pipefail

DEPOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV="$DEPOT/.env.essai"
JOURS=""

rouge() { printf '\033[31m%s\033[0m\n' "$*"; }
vert()  { printf '\033[32m%s\033[0m\n' "$*"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --jours) JOURS="${2:?--jours attend un nombre de 1 à 31}"; shift 2 ;;
    *) rouge "Option inconnue : $1"; exit 1 ;;
  esac
done
[[ -z "$JOURS" || "$JOURS" =~ ^([1-9]|[12][0-9]|3[01])$ ]] \
  || { rouge "--jours attend un nombre de 1 à 31."; exit 1; }

[[ -f "$ENV" ]] || { rouge "$ENV manque — l'instance d'essai n'est pas installée."; exit 1; }

# Une valeur de `.env.essai`, sans jamais l'afficher.
valeur() { grep -m1 "^$1=" "$ENV" | cut -d= -f2- || true; }

SECRET="$(valeur RECEPTION_OFFRES_SECRET)"
if [[ -z "$SECRET" || -z "$(valeur FRANCE_TRAVAIL_CLIENT_ID)" || -z "$(valeur FRANCE_TRAVAIL_CLIENT_SECRET)" ]]; then
  echo "réception des offres non configurée dans $ENV — voir docs/france-travail.md"
  exit 3
fi

PORT="$(valeur WEB_PORT)"
RACINE="http://127.0.0.1:${PORT:-3003}/api/offres/recevoir"
REPRISE=0

# Un nombre du bilan, lu sans outil JSON : `"jours":31` → 31.
nombre() { printf '%s' "$2" | sed -n "s/.*\"$1\":\([0-9][0-9]*\).*/\1/p"; }

for tour in $(seq 1 10); do
  # Au premier passage, la route choisit la profondeur ; aux suivants on lui
  # rend la sienne, et le nombre de fenêtres déjà lues : elle reprend là.
  ADRESSE="$RACINE?reprise=$REPRISE"
  [[ -n "$JOURS" ]] && ADRESSE="$ADRESSE&jours=$JOURS"
  # Le secret passe par l'entrée standard de curl, pas par la ligne de
  # commande : il n'apparaît ni dans `ps`, ni dans le journal de la minuterie.
  reponse="$(printf 'header = "Authorization: Bearer %s"\n' "$SECRET" \
    | curl -sS --max-time 290 -X POST -K - -w '\n%{http_code}' "$ADRESSE" || true)"
  code="${reponse##*$'\n'}"
  corps="${reponse%$'\n'*}"

  if [[ "$code" != "200" ]]; then
    rouge "réception des offres : échec (HTTP ${code:-aucun}) — $corps"
    exit 1
  fi

  # Des compteurs seulement : la route ne renvoie rien d'autre.
  echo "  passage $tour : $corps"
  if [[ "$corps" == *'"termine":true'* ]]; then
    vert "offres France Travail à jour"
    exit 0
  fi

  JOURS="$(nombre jours "$corps")"
  REPRISE="$(nombre fenetres_lues "$corps")"
  REPRISE="${REPRISE:-0}"
done

rouge "réception des offres : toujours inachevée après dix passages — elle reprendra au prochain."
exit 1
