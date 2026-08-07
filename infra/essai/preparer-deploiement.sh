#!/usr/bin/env bash
# Ouvre le déploiement automatique de l'instance d'ESSAI, depuis GitHub.
#
#   sudo ./infra/essai/preparer-deploiement.sh essai.mondomaine.fr
#
# À lancer une seule fois, sur le VPS, depuis le dépôt qui a servi à
# l'installation — c'est chez lui qu'est le `.env.essai` à reprendre.
#
# Ce qu'il met en place, et pourquoi ainsi :
#
#   * un compte dédié, sans mot de passe, dont la clé SSH ne peut accomplir
#     **qu'un seul geste** : lancer le déploiement. Pas de terminal, pas de
#     transfert de fichier, pas de redirection de port. Si cette clé fuite,
#     elle ne donne rien d'autre que ce geste-là ;
#
#   * un lanceur appartenant à `root`, dans un dossier où ce compte ne peut
#     pas écrire. C'est le point qui compte : donner à la fois le droit de
#     déposer des fichiers et celui de lancer en `sudo` un script parmi ces
#     fichiers, c'est donner `root`. Il suffirait de réécrire le script ;
#
#   * un dépôt que le serveur va chercher lui-même sur GitHub, plutôt que de
#     recevoir des fichiers. Ce qui tourne vient donc de `main`, et de rien
#     d'autre — pas de ce que la machine de construction avait sous la main.
#
# Le script est rejouable : relancé, il refait la clé et complète le reste.

set -euo pipefail

HOTE="${1:-}"
COMPTE=deploiement-heracles
DEPOT=/opt/heracles-essai-depot
DEPOT_URL=https://github.com/Tiptop33/HERACLES.git
BRANCHE=main
LANCEUR=/usr/local/sbin/heracles-essai-deployer
REGLE_SUDO=/etc/sudoers.d/heracles-essai
SOURCE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

rouge() { printf '\033[31m%s\033[0m\n' "$*"; }
vert()  { printf '\033[32m%s\033[0m\n' "$*"; }
etape() { printf '\n\033[1m── %s\033[0m\n' "$*"; }

if [[ -z "$HOTE" ]]; then
  rouge "Usage : sudo $0 <nom-public-du-VPS>"
  echo   "Exemple : sudo $0 essai.mondomaine.fr"
  echo   "Ce nom est celui par lequel GitHub joindra le serveur."
  exit 1
fi

etape "Vérifications"
[[ $EUID -eq 0 ]] || { rouge "À lancer avec sudo."; exit 1; }
for outil in git ssh-keygen ssh-keyscan useradd visudo; do
  command -v "$outil" >/dev/null || { rouge "$outil est absent."; exit 1; }
done
SUDO="$(command -v sudo)"

ENV_ESSAI="${2:-$SOURCE/.env.essai}"
if [[ ! -f "$ENV_ESSAI" ]]; then
  rouge "Introuvable : $ENV_ESSAI"
  echo  "C'est le fichier qu'a écrit deployer.sh, avec les clés de l'application."
  echo  "Indiquez-le en second argument s'il est ailleurs."
  exit 1
fi
vert "outils présents, $ENV_ESSAI trouvé"

# ————— Le compte —————
etape "Compte dédié « $COMPTE »"
if id -u "$COMPTE" >/dev/null 2>&1; then
  vert "compte déjà là"
else
  useradd --create-home --shell /bin/bash "$COMPTE"
  vert "compte créé"
fi
# Pas de mot de passe : on n'entre par ce compte qu'avec la clé, et la clé ne
# sait faire qu'une chose.
passwd -l "$COMPTE" >/dev/null 2>&1 || true

# ————— Le dépôt, tenu par root —————
etape "Dépôt → $DEPOT"
if [[ -d "$DEPOT/.git" ]]; then
  git -C "$DEPOT" remote set-url origin "$DEPOT_URL"
  vert "dépôt déjà là"
else
  git clone --quiet --branch "$BRANCHE" "$DEPOT_URL" "$DEPOT"
  vert "dépôt cloné depuis $BRANCHE"
fi

# `root` et lui seul. Le compte de déploiement peut lire, jamais écrire : c'est
# ce qui l'empêche de réécrire ce que le lanceur va exécuter en root.
chown -R root:root "$DEPOT"
chmod -R go-w "$DEPOT"

# Le `.env.essai` porte les clés de l'application. Il n'est pas dans le dépôt —
# `.env.*` est ignoré — donc on le recopie, en 600.
install -m 600 -o root -g root "$ENV_ESSAI" "$DEPOT/.env.essai"
vert "dépôt en root, .env.essai repris en 600"

# ————— Le lanceur —————
etape "Lanceur → $LANCEUR"
cat > "$LANCEUR" <<FIN
#!/usr/bin/env bash
# Le SEUL geste que la clé de déploiement peut accomplir.
#
# Engendré par infra/essai/preparer-deploiement.sh — ne pas modifier à la main.
#
# Il appartient à root et vit hors du dépôt : le compte de déploiement ne peut
# donc ni le réécrire, ni réécrire ce qu'il exécute. Sans cela, « déposer des
# fichiers » et « lancer un script en sudo » se combineraient en « devenir
# root ».
#
# Il ne prend aucun argument : rien de ce que dit le client n'entre ici. Ce qui
# est déployé, c'est $BRANCHE, telle qu'elle est sur GitHub à cet instant.

set -euo pipefail

DEPOT=$DEPOT
BRANCHE=$BRANCHE

echo "── Récupération de \$BRANCHE"
git -C "\$DEPOT" fetch --quiet origin "\$BRANCHE"
git -C "\$DEPOT" reset --hard --quiet "origin/\$BRANCHE"
# Les fichiers ignorés — dont .env.essai — ne sont pas touchés : \`clean -fd\`
# ne va pas les chercher, il faudrait \`-x\`.
git -C "\$DEPOT" clean -fdq
echo "   \$(git -C "\$DEPOT" log --oneline -1)"

exec "\$DEPOT/infra/essai/mettre-a-jour.sh"
FIN
chown root:root "$LANCEUR"
chmod 755 "$LANCEUR"
vert "lanceur posé, root:root en 755"

# ————— Le droit sudo, réduit à ce seul lanceur —————
etape "Droit sudo"
printf '%s ALL=(root) NOPASSWD: %s\n' "$COMPTE" "$LANCEUR" > "$REGLE_SUDO"
chmod 440 "$REGLE_SUDO"
if ! visudo -cf "$REGLE_SUDO" >/dev/null; then
  rm -f "$REGLE_SUDO"
  rouge "La règle sudo est refusée — rien n'a été posé."
  exit 1
fi
vert "« $COMPTE » peut lancer $LANCEUR, et rien d'autre"

# ————— La clé —————
etape "Clé de déploiement"
# Fabriquée ici, dans un dossier éphémère. La partie privée est affichée une
# fois, puis effacée : elle ne doit exister que dans les secrets de GitHub.
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
ssh-keygen -q -t ed25519 -N '' -C "deploiement-heracles-essai" -f "$tmp/cle"

install -d -m 700 -o "$COMPTE" -g "$COMPTE" "/home/$COMPTE/.ssh"
# `restrict` retire tout : terminal, redirections de port, agent, X11. `command`
# impose le geste unique — ce que le client demande n'est jamais lu.
printf 'restrict,command="%s -n %s" %s\n' "$SUDO" "$LANCEUR" "$(cat "$tmp/cle.pub")" \
  > "/home/$COMPTE/.ssh/authorized_keys"
chown "$COMPTE:$COMPTE" "/home/$COMPTE/.ssh/authorized_keys"
chmod 600 "/home/$COMPTE/.ssh/authorized_keys"
vert "clé installée, réduite à un seul geste"

EMPREINTE="$(ssh-keyscan -H "$HOTE" 2>/dev/null | grep -v '^#' || true)"
if [[ -z "$EMPREINTE" ]]; then
  rouge "ssh-keyscan n'a rien obtenu pour « $HOTE »."
  echo  "Vérifiez que ce nom désigne bien ce serveur. Sans empreinte, GitHub"
  echo  "accepterait n'importe quelle machine répondant à ce nom."
  exit 1
fi

# ————— Ce qu'il reste à coller —————
etape "Les quatre secrets à poser dans GitHub"
cat <<FIN

  Réglages du dépôt → Secrets and variables → Actions → New repository secret.
  Quatre secrets, à créer un par un, aux noms exacts ci-dessous.

────────────────────────────────────────────────────────────────────────────
VPS_HOTE
$HOTE

────────────────────────────────────────────────────────────────────────────
VPS_UTILISATEUR
$COMPTE

────────────────────────────────────────────────────────────────────────────
VPS_EMPREINTE
$EMPREINTE

────────────────────────────────────────────────────────────────────────────
VPS_CLE_SSH
$(cat "$tmp/cle")
────────────────────────────────────────────────────────────────────────────

  La clé privée ci-dessus n'existe plus nulle part ailleurs : ce dossier
  éphémère disparaît en même temps que ce script. Copiez-la en entier, de
  « -----BEGIN » à « -----END----- » compris, ligne finale vide comprise.

  Puis fermez ce terminal, et videz son historique d'affichage : une clé
  privée n'a rien à faire dans une fenêtre qui reste ouverte.

FIN

etape "Éprouver sans attendre GitHub"
cat <<FIN

  Depuis n'importe quelle machine ayant cette clé :

    ssh -i <la-cle> $COMPTE@$HOTE

  Aucune commande à écrire : le serveur n'en accepte qu'une, et c'est le
  déploiement. Vous devez voir défiler les migrations puis la reconstruction.

  Essayez aussi ceci — ça doit être refusé :

    ssh -i <la-cle> $COMPTE@$HOTE 'cat /etc/shadow'

FIN
