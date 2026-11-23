#!/usr/bin/env bash
# Fait recevoir les offres de France Travail toute seule, plusieurs fois par jour.
#
#   sudo ./infra/essai/installer-reception-offres.sh
#
# À lancer UNE fois, après avoir rangé dans `.env.essai` les deux identifiants
# de l'application déclarée chez France Travail (docs/france-travail.md) :
#
#   FRANCE_TRAVAIL_CLIENT_ID=…
#   FRANCE_TRAVAIL_CLIENT_SECRET=…
#
# Ce que fait ce script :
#   1. fabrique le secret de la route de réception, s'il n'existe pas encore ;
#   2. redémarre l'application, pour qu'elle lise ces réglages ;
#   3. pose une minuterie systemd — toutes les trois heures ;
#   4. reçoit tout de suite le mois écoulé, pour que l'écran « France Travail »
#      ne soit pas vide en attendant le premier passage.
#
# Le rejouer est sans danger : rien n'est fabriqué deux fois.

set -euo pipefail

PROJET=heracles-essai
DEPOT_AUTO=/opt/heracles-essai-depot
DEPOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

rouge() { printf '\033[31m%s\033[0m\n' "$*"; }
vert()  { printf '\033[32m%s\033[0m\n' "$*"; }
etape() { printf '\n\033[1m── %s\033[0m\n' "$*"; }

[[ $EUID -eq 0 ]] || { rouge "À lancer avec sudo."; exit 1; }
command -v systemctl >/dev/null || { rouge "systemd est absent : posez une entrée cron à la place (docs/france-travail.md)."; exit 1; }

# Le dépôt que le déploiement rafraîchit, s'il existe : la minuterie doit
# suivre les corrections apportées au script.
[[ -x "$DEPOT_AUTO/infra/essai/recevoir-offres.sh" ]] && DEPOT="$DEPOT_AUTO"
SCRIPT="$DEPOT/infra/essai/recevoir-offres.sh"
ENV="$DEPOT/.env.essai"
[[ -x "$SCRIPT" ]] || { rouge "$SCRIPT est introuvable ou non exécutable."; exit 1; }
[[ -f "$ENV" ]] || { rouge "$ENV manque — l'instance d'essai n'est pas installée."; exit 1; }

etape "Les identifiants France Travail"
for cle in FRANCE_TRAVAIL_CLIENT_ID FRANCE_TRAVAIL_CLIENT_SECRET; do
  if ! grep -qE "^$cle=." "$ENV"; then
    rouge "$cle manque dans $ENV."
    echo  "Ajoutez les deux lignes, puis relancez ce script :"
    echo  "  FRANCE_TRAVAIL_CLIENT_ID=…"
    echo  "  FRANCE_TRAVAIL_CLIENT_SECRET=…"
    echo  "D'où ils viennent : docs/france-travail.md, « Les identifiants »."
    exit 1
  fi
done
vert "présents dans $ENV"

etape "Le secret de la route"
if grep -qE '^RECEPTION_OFFRES_SECRET=.{32,}' "$ENV"; then
  vert "déjà là"
else
  # Une ligne vide ou trop courte laissée là fermerait la route : on la retire.
  sed -i '/^RECEPTION_OFFRES_SECRET=/d' "$ENV"
  printf 'RECEPTION_OFFRES_SECRET=%s\n' "$(openssl rand -hex 32)" >> "$ENV"
  chmod 600 "$ENV"
  vert "fabriqué et rangé dans $ENV"
fi

etape "L'application relit ses réglages"
( cd "$DEPOT" && docker compose --env-file .env.essai \
    -f infra/docker-compose.prod.yml -p "$PROJET-web" up -d ) >/dev/null
port="$(grep -m1 '^WEB_PORT=' "$ENV" | cut -d= -f2)"
for _ in $(seq 1 30); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${port:-3003}/connexion" || true)"
  [[ "$code" == "200" ]] && break
  sleep 2
done
[[ "${code:-}" == "200" ]] || { rouge "l'application ne répond pas (HTTP ${code:-aucun})."; exit 1; }
vert "l'application répond"

etape "La tâche"
cat > /etc/systemd/system/heracles-offres.service <<UNIT
[Unit]
Description=Réception des offres France Travail — instance d'essai HERACLES
Documentation=file://$DEPOT/docs/france-travail.md
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=$SCRIPT
# « Rien à faire » (réception non configurée) n'est pas une panne.
SuccessExitStatus=3
Nice=10
UNIT
vert "heracles-offres.service"

etape "La minuterie"
cat > /etc/systemd/system/heracles-offres.timer <<UNIT
[Unit]
Description=Réception des offres France Travail, toutes les trois heures

[Timer]
OnCalendar=*-*-* 00/3:17:00
# Serveur éteint à l'heure dite : la réception se rattrape au démarrage.
Persistent=true
RandomizedDelaySec=300

[Install]
WantedBy=timers.target
UNIT
vert "heracles-offres.timer — toutes les trois heures"

systemctl daemon-reload
systemctl enable --now heracles-offres.timer >/dev/null

etape "Première réception : le mois écoulé"
echo "Quelques minutes : l'écran « France Travail » se remplit pendant ce temps."
"$SCRIPT" --jours 31 || rouge "première réception incomplète — la minuterie reprendra."

etape "La minuterie est en place"
systemctl list-timers heracles-offres.timer --no-pager | sed -n '1,2p'

cat <<'FIN'

  À vérifier de temps en temps :

    systemctl status heracles-offres.timer     # elle tourne toujours ?
    journalctl -u heracles-offres -n 40        # la dernière réception s'est bien passée ?

FIN
