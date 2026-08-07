#!/usr/bin/env bash
# Fait tourner la sauvegarde toute seule, chaque nuit.
#
#   sudo ./infra/essai/installer-sauvegarde.sh
#   sudo ./infra/essai/installer-sauvegarde.sh --heure 04:15 --garder 30
#
# Pose une minuterie systemd, la met en marche, et prend une première
# sauvegarde tout de suite — pour qu'il en existe une avant la fin de cette
# commande, et non demain matin.
#
# La minuterie pointe sur le dépôt que le déploiement met à jour : le script de
# sauvegarde suivra ses corrections sans qu'on ait à réinstaller quoi que ce
# soit.
#
# Ce que ceci ne fait pas : sortir les archives du serveur. Aucune clé vers
# l'extérieur n'est posée ici, et c'est voulu — un serveur qui sait écrire chez
# vous est un serveur qui peut, le jour où il est pris, effacer chez vous. La
# copie se tire depuis votre poste ; la fin du script dit comment.

set -euo pipefail

HEURE=03:20
GARDER=14
DEPOT_AUTO=/opt/heracles-essai-depot
DEPOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

rouge() { printf '\033[31m%s\033[0m\n' "$*"; }
vert()  { printf '\033[32m%s\033[0m\n' "$*"; }
etape() { printf '\n\033[1m── %s\033[0m\n' "$*"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --heure)  HEURE="${2:?--heure attend HH:MM}"; shift 2 ;;
    --garder) GARDER="${2:?--garder attend un nombre}"; shift 2 ;;
    *) rouge "Option inconnue : $1"; exit 1 ;;
  esac
done

[[ $EUID -eq 0 ]] || { rouge "À lancer avec sudo."; exit 1; }
command -v systemctl >/dev/null || { rouge "systemd est absent : posez une entrée cron à la place."; exit 1; }
[[ "$HEURE" =~ ^[0-2][0-9]:[0-5][0-9]$ ]] || { rouge "--heure attend HH:MM (ex. 03:20)."; exit 1; }

# Le dépôt que le déploiement rafraîchit, s'il existe : la minuterie doit
# suivre les corrections apportées au script.
[[ -x "$DEPOT_AUTO/infra/essai/sauvegarder.sh" ]] && DEPOT="$DEPOT_AUTO"
SCRIPT="$DEPOT/infra/essai/sauvegarder.sh"
[[ -x "$SCRIPT" ]] || { rouge "$SCRIPT est introuvable ou non exécutable."; exit 1; }

etape "La tâche"
cat > /etc/systemd/system/heracles-sauvegarde.service <<UNIT
[Unit]
Description=Sauvegarde de l'instance d'essai HERACLES
Documentation=file://$DEPOT/docs/sauvegarde.md
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=$SCRIPT --garder $GARDER
# Une sauvegarde ne doit jamais peser sur l'application qu'elle copie.
Nice=10
IOSchedulingClass=idle
UNIT
vert "heracles-sauvegarde.service"

etape "La minuterie"
cat > /etc/systemd/system/heracles-sauvegarde.timer <<UNIT
[Unit]
Description=Sauvegarde nocturne de HERACLES

[Timer]
OnCalendar=*-*-* $HEURE:00
# Serveur éteint à l'heure dite : la sauvegarde se rattrape au démarrage
# suivant, au lieu d'être simplement sautée.
Persistent=true
# Quelques minutes de flou : deux machines installées le même jour ne
# démarrent pas leur sauvegarde à la même seconde.
RandomizedDelaySec=300

[Install]
WantedBy=timers.target
UNIT
vert "heracles-sauvegarde.timer — chaque nuit à $HEURE"

systemctl daemon-reload
systemctl enable --now heracles-sauvegarde.timer >/dev/null

etape "Première sauvegarde, tout de suite"
echo "Pour qu'il en existe une avant la fin de cette commande."
"$SCRIPT" --garder "$GARDER"

etape "La minuterie est en place"
systemctl list-timers heracles-sauvegarde.timer --no-pager | sed -n '1,2p'

cat <<'FIN'

  À vérifier de temps en temps :

    systemctl status heracles-sauvegarde.timer     # elle tourne toujours ?
    journalctl -u heracles-sauvegarde -n 40        # la dernière s'est bien passée ?
    ls -lh /var/backups/heracles                   # les archives sont là ?

  Et le geste qui manque encore, à faire depuis VOTRE poste :

    rsync -avz --remove-source-files=no \
      root@<le-serveur>:/var/backups/heracles/ ~/sauvegardes-heracles/

  Tant que cette ligne n'est pas passée, la sauvegarde et ce qu'elle protège
  sont sur le même disque.

FIN
