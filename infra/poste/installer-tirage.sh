#!/bin/bash
# Fait tirer les sauvegardes toutes seules, chaque matin. À lancer SUR LE MAC.
#
#   ./installer-tirage.sh root@essai.oaf-heracles.cloud
#   ./installer-tirage.sh root@essai.oaf-heracles.cloud --heure 08:30 --garder 30
#
# Pose une tâche `launchd`, la met en marche, et tire une première fois tout de
# suite. Sans `sudo` : c'est une tâche de session, elle ne tourne que sous
# votre compte et ne touche rien du système.
#
# Le script tiré est recopié dans « Application Support » : la tâche ne dépend
# donc pas d'un dossier que vous pourriez déplacer. Pour la mettre à jour,
# relancez cette commande.

set -u

CIBLE="${1:-}"
shift 2>/dev/null || true
HEURE=08:30
GARDER=30
ETIQUETTE=cloud.oaf-heracles.sauvegarde
CHEZ_MOI="$HOME/Library/Application Support/heracles"
PLIST="$HOME/Library/LaunchAgents/$ETIQUETTE.plist"
OU="$HOME/sauvegardes-heracles"
DEPOT_BRUT=https://raw.githubusercontent.com/Tiptop33/HERACLES/main/infra/poste

rouge() { printf '\033[31m%s\033[0m\n' "$*"; }
vert()  { printf '\033[32m%s\033[0m\n' "$*"; }
etape() { printf '\n\033[1m── %s\033[0m\n' "$*"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --heure)  HEURE="${2:-}"; shift 2 ;;
    --garder) GARDER="${2:-}"; shift 2 ;;
    *) rouge "Option inconnue : $1"; exit 1 ;;
  esac
done

if [ -z "$CIBLE" ]; then
  rouge "Il manque l'adresse du serveur."
  echo  "  $0 root@essai.oaf-heracles.cloud"
  exit 2
fi

[ "$(uname)" = "Darwin" ] || { rouge "Ceci s'installe sur macOS. Sous Linux, posez une tâche cron."; exit 1; }
[ "$(id -u)" != "0" ] || { rouge "Sans sudo : c'est une tâche de votre session, pas du système."; exit 1; }

case "$HEURE" in
  [0-2][0-9]:[0-5][0-9]) ;;
  *) rouge "--heure attend HH:MM (ex. 08:30)."; exit 1 ;;
esac
HH="${HEURE%%:*}"; MM="${HEURE##*:}"

# ————— La clé —————
# Une tâche de fond n'a pas d'écran : si `ssh` demande un mot de passe, elle
# reste plantée là sans que personne ne le sache. On l'éprouve maintenant,
# pendant qu'il y a quelqu'un pour lire.
etape "L'accès au serveur, sans mot de passe"
if ssh -o BatchMode=yes -o ConnectTimeout=20 -o StrictHostKeyChecking=accept-new \
     "$CIBLE" true >/dev/null 2>&1; then
  vert "la connexion passe sans rien demander"
else
  rouge "La connexion à $CIBLE demande un mot de passe — ou échoue."
  cat <<FIN

  Une tâche automatique ne peut pas en taper un. Il faut une clé — en laissant
  la phrase de passe vide, sinon on retombe sur le même problème :

    ssh-keygen -t ed25519 -C "sauvegardes heracles"
    ssh-copy-id $CIBLE

  La seconde commande demandera le mot de passe : c'est la dernière fois.
  Puis relancez celle-ci. Si \`ssh-copy-id\` n'existe pas :

    cat ~/.ssh/id_ed25519.pub | ssh $CIBLE 'mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys'

FIN
  exit 1
fi

# ————— Le script —————
etape "Le script de tirage"
mkdir -p "$CHEZ_MOI" "$OU"
ICI="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$ICI/tirer-sauvegardes.sh" ]; then
  cp "$ICI/tirer-sauvegardes.sh" "$CHEZ_MOI/tirer-sauvegardes.sh"
  vert "recopié depuis $ICI"
elif command -v curl >/dev/null; then
  curl -fsSL "$DEPOT_BRUT/tirer-sauvegardes.sh" -o "$CHEZ_MOI/tirer-sauvegardes.sh" \
    || { rouge "Téléchargement impossible depuis $DEPOT_BRUT"; exit 1; }
  vert "téléchargé depuis le dépôt"
else
  rouge "tirer-sauvegardes.sh est introuvable à côté de ce script."
  exit 1
fi
chmod +x "$CHEZ_MOI/tirer-sauvegardes.sh"

# ————— La tâche —————
etape "La tâche launchd"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PLISTE
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$ETIQUETTE</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$CHEZ_MOI/tirer-sauvegardes.sh</string>
    <string>$CIBLE</string>
    <string>$OU</string>
  </array>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>HERACLES_GARDER</key><string>$GARDER</string>
  </dict>

  <!-- Chaque jour à $HEURE. Mac endormi à cette heure-là : launchd rattrape
       au réveil au lieu de sauter le tour. -->
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>$((10#$HH))</integer>
    <key>Minute</key><integer>$((10#$MM))</integer>
  </dict>

  <key>StandardOutPath</key><string>$OU/journal-launchd.txt</string>
  <key>StandardErrorPath</key><string>$OU/journal-launchd.txt</string>

  <!-- Une sauvegarde ne doit jamais peser sur ce qu'on est en train de faire. -->
  <key>Nice</key><integer>10</integer>
  <key>ProcessType</key><string>Background</string>
</dict>
</plist>
PLISTE
vert "$PLIST — chaque jour à $HEURE"

# `bootout`/`bootstrap` sur les macOS récents, `unload`/`load` sinon.
if launchctl bootout "gui/$(id -u)/$ETIQUETTE" >/dev/null 2>&1; then :; fi
if ! launchctl bootstrap "gui/$(id -u)" "$PLIST" >/dev/null 2>&1; then
  launchctl unload "$PLIST" >/dev/null 2>&1
  launchctl load -w "$PLIST" >/dev/null 2>&1 \
    || { rouge "launchd a refusé la tâche. Voir : launchctl print gui/$(id -u)/$ETIQUETTE"; exit 1; }
fi
vert "tâche chargée"

# ————— Un premier tirage, tout de suite —————
# Et s'il échoue, on le dit ici plutôt que de laisser croire que c'est en
# place : demain matin, il n'y aura personne pour lire l'erreur.
etape "Premier tirage"
if ! HERACLES_GARDER="$GARDER" "$CHEZ_MOI/tirer-sauvegardes.sh" "$CIBLE" "$OU"; then
  echo
  rouge "La tâche est posée, mais ce premier tirage a échoué."
  echo  "Corrigez d'abord, puis rejouez-le à la main :"
  echo  "  \"$CHEZ_MOI/tirer-sauvegardes.sh\" $CIBLE"
  echo  "Le journal dit ce qui s'est passé : $OU/journal.txt"
  exit 1
fi

etape "C'est en place"
cat <<FIN

  À vérifier de temps en temps :

    launchctl print gui/$(id -u)/$ETIQUETTE | head -20   # la tâche est-elle là ?
    tail -20 $OU/journal.txt                             # le dernier tirage
    ls -lh $OU                                           # les archives

  Pour l'arrêter :

    launchctl bootout gui/$(id -u)/$ETIQUETTE && rm $PLIST

  Un échec se signale tout seul, par une notification. Mais une notification
  ratée n'est pas une preuve : jetez un œil au journal une fois par mois.

FIN
