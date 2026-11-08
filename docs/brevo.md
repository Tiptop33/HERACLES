# Les courriels : paramétrer Brevo

- **Date :** 2026-11-08 — mis à jour le même jour, après la mise en service
  sur l'instance d'essai.
- **Ce document ne contient aucun secret**, ni adresse de serveur, ni
  identifiant de compte. Les clés se créent chez Brevo, se saisissent sur le
  VPS, et n'en sortent pas. Les domaines sont des exemples :
  `mondomaine.fr`, `essai.mondomaine.fr`.
- Les noms de menus de Brevo et de Hostinger sont ceux de novembre 2026.

## Ce qui est en service

L'instance d'essai envoie par Brevo depuis le 8 novembre 2026, sur les deux
canaux. Vérifié par de vrais envois vers une boîte Gmail :

| | Invitations, mots de passe | Parrains, candidats |
| --- | --- | --- |
| Arrivée | Boîte de réception | Boîte de réception |
| DKIM / DMARC | `PASS` | `PASS` / `PASS` |
| Liens | — | directs, non réécrits par Brevo |

**La production reste à faire** : même procédure (§ 9), avec son propre
domaine authentifié et ses propres clés.

## Deux canaux, deux clés

HERACLES envoie des courriels par deux chemins qui ne se connaissent pas.
Brevo sert les deux, mais **avec deux clés différentes** — et les inverser est
l'erreur la plus fréquente.

| Canal | Ce qu'il envoie | Qui envoie | Par où | Ce qu'il lit |
| --- | --- | --- | --- | --- |
| **Authentification** | invitations, réinitialisation de mot de passe | GoTrue, dans la pile Supabase | SMTP | `SMTP_*` dans `/opt/supabase-heracles[-essai]/.env` |
| **Application** | lien au parrain, lien au candidat | Next.js — `apps/web/src/lib/courriel.ts` | API HTTPS | `BREVO_API_KEY`, `COURRIEL_EXPEDITEUR`, `COURRIEL_NOM_EXPEDITEUR` |

Sans le premier, **personne n'entre** : on n'entre qu'invité. Sans le second,
le parcours « nouveau candidat » fonctionne encore — le lien s'affiche au
référent, qui le transmet à la main (`docs/parrainage.md`).

Le candidat ne reçoit **rien** quand le référent saisit son adresse dans
*Nouveau candidat* : elle est seulement gardée pour pré-remplir le formulaire
du parrain. Son lien part quand le parrain l'a présenté. Ce n'est pas une
panne, c'est le parcours de Bubble.

## 1. Le compte

- Bubble employait déjà Brevo, vraisemblablement **sur le même compte** : les
  deux plages Amazon autorisées d'office (§ 5) sont les siennes. Des clés
  propres à HERACLES se révoquent à la fermeture de Bubble sans rien couper
  ici.
- Compléter le profil de l'organisation : un compte neuf peut rester « en
  cours de vérification » et ne rien envoyer, sans erreur bien visible.
- **Plan gratuit : 300 courriels par jour, pour tout le compte** — essai,
  production et Bubble confondus. Le jour de la bascule, si l'on invite tout
  le monde à la fois, étaler sur deux jours ou prendre un mois payant.

## 2. Authentifier le domaine

C'est le prérequis qui bloque tout le reste. **Une adresse `@gmail.com` ne
peut pas être expéditrice** : sa politique DMARC fait rejeter par Gmail et
Yahoo tout courriel qui s'en réclame sans venir de Google.

**On authentifie le domaine de l'instance** — `essai.mondomaine.fr` pour
l'essai. Ce choix a été fait le 8 novembre : il ne touche ni au domaine
racine ni aux boîtes mail de l'organisation, mais il oblige à refaire cette
étape pour la production, sur son propre domaine.

1. Brevo → **Paramètres → Expéditeurs, domaine, IP → onglet Domaines →
   Ajouter un domaine**.
2. Brevo affiche les enregistrements à créer : un `TXT` (`brevo-code:…`) et
   deux `CNAME` DKIM (`brevo1._domainkey…`, `brevo2._domainkey…`). **Les
   recopier par les boutons « Copier »**, pas à la main.
3. Les poser **dans la zone DNS du domaine**, chez Hostinger : **hPanel →
   Noms de domaine → le domaine → DNS / Serveurs de noms**. Le champ « Nom »
   ne prend que ce qui précède le domaine (`brevo1._domainkey.essai`) :
   Hostinger ajoute le reste tout seul.
4. Vérifier qu'ils sont **publiés** avant de cliquer sur **Authentifier**
   (ci-dessous).
5. Le DMARC n'a pas besoin d'être refait : celui du domaine racine
   (`_dmarc` → `v=DMARC1; p=none`) vaut pour ses sous-domaines, et Brevo
   l'accepte.

### Les deux pièges rencontrés

- **Le « Gestionnaire DNS » du VPS n'est pas la zone du domaine.** Dans
  hPanel, le menu du VPS a une entrée de ce nom ; des enregistrements posés là
  ne sont pas publiés. Le bon chemin part de **Noms de domaine**. Le signe
  qu'on est au bon endroit : la liste montre déjà les `A` de l'application
  (`essai`, `api-essai`).
- **« En attente de propagation » peut cacher un enregistrement jamais
  enregistré.** Le numéro de version de la zone (`SOA`) change à chaque
  modification enregistrée chez Hostinger. S'il ne bouge pas, ce n'est pas
  le DNS qui est lent : les enregistrements ne sont pas dans la zone.

```bash
# Depuis n'importe quel poste : la version de la zone, puis les trois enregistrements.
for q in "mondomaine.fr SOA" "essai.mondomaine.fr TXT" \
         "brevo1._domainkey.essai.mondomaine.fr CNAME" "brevo2._domainkey.essai.mondomaine.fr CNAME"; do
  set -- $q; echo "$1 $2 → $(curl -s "https://dns.google/resolve?name=$1&type=$2" | grep -o '"data":"[^"]*"' | head -1)"
done
```

Une fois publiés chez Hostinger, compter quelques minutes : le TTL est court
(300 s).

Ne jamais cliquer sur **« Réinitialiser les enregistrements DNS »** en bas de
la page de Hostinger : il effacerait les `A` de l'application.

## 3. L'expéditeur

Brevo → **Expéditeurs, domaine, IP → onglet Expéditeurs → Ajouter un
expéditeur** : `no-reply@essai.mondomaine.fr`, nom « HERACLES ».

Le domaine étant authentifié, Brevo le **vérifie aussitôt**, sans code par
courriel — heureusement, car `no-reply@…` ne reçoit rien. S'il proposait d'en
envoyer un, ne pas le faire : c'est le signe que le domaine n'est pas encore
authentifié.

Une seule adresse sert les deux canaux. Côté application, chaque courriel
affiche le nom de la loge et, quand un référent en est à l'origine, le désigne
pour recevoir les réponses ; l'adresse d'envoi, elle, ne change pas.

`composer-env.sh` ne déduit plus l'adresse du domaine de l'application : elle
se donne à l'installation (§ 7). Une adresse sur le domaine de l'application
ne marche que si ce domaine est authentifié chez Brevo — c'est le cas de
l'essai, et `deployer.sh` le signale par un avertissement qu'on peut alors
ignorer.

## 4. Les clés — une paire par instance

Brevo → **Paramètres → SMTP et API** :

| Onglet | Préfixe | Variable | Nom à lui donner |
| --- | --- | --- | --- |
| **SMTP** → *Générer une clé SMTP* | `xsmtpsib-…` | `SMTP_PASS` | `heracles-essai-gotrue` |
| **Clés API et MCP** → *Générer une nouvelle clé API* | `xkeysib-…` | `BREVO_API_KEY` | `heracles-essai-web` |

Puis la même paire pour la production : `heracles-prod-gotrue`,
`heracles-prod-web`. L'essai se révoque alors sans toucher à la production.

Une clé ne s'affiche **qu'une fois** : la ranger aussitôt dans le
gestionnaire de mots de passe.

### La clé API : accès restreint

Le formulaire propose un accès **Complet** ou **Restreint**. Restreint, avec :

| Ressource | Accès | Pourquoi |
| --- | --- | --- |
| Emails transactionnels | **Tous** | « Lues » ne permet pas d'envoyer |
| Compte | **Lues** | pour que le diagnostic (§ 8) vérifie la clé sans rien envoyer |
| Tout le reste | Aucune | contacts, campagnes, SMS, webhooks : HERACLES n'en a pas l'usage |

Expiration : **Pas d'expiration**. La clé expire tout de même après 90 jours
sans envoi.

Une clé volée permettrait d'envoyer des courriels transactionnels, pas de lire
les contacts ni de lancer une campagne.

### L'identifiant SMTP

Sur l'onglet SMTP figure l'**identifiant** de connexion, de la forme
`xxxxxx@smtp-brevo.com`. C'est lui qui va dans `SMTP_USER` — pas l'adresse
avec laquelle on se connecte à Brevo.

| Symptôme | Cause |
| --- | --- |
| `535 Authentication failed` dans le journal de `auth` | clé API dans `SMTP_PASS`, ou adresse de connexion dans `SMTP_USER` |
| `401` dans le journal de `web` | clé SMTP dans `BREVO_API_KEY`, ou adresse IP non autorisée (§ 5) |

### Une clé vue est une clé à remplacer

Une clé apparue à l'écran — capture, conversation, commande collée au mauvais
endroit — ne se cache pas après coup : on en génère une nouvelle, on la pose
(§ 7), puis on **supprime l'ancienne** chez Brevo. Si elle est passée dans une
ligne de commande, l'effacer aussi de l'historique du VPS :

```bash
sed -i '/xsmtpsib-\|xkeysib-/d' ~/.bash_history; history -c; history -r
```

## 5. Autoriser les adresses IP du VPS

Brevo bloque les appels d'API — et, une fois le blocage activé, les
connexions SMTP — venus d'une adresse qu'il ne connaît pas.

1. Les deux adresses du VPS : `curl -4 ifconfig.me` et `curl -6 ifconfig.me`.
   **Les deux** : le serveur sort tantôt par l'IPv4, tantôt par l'IPv6. Le
   8 novembre, le conteneur de l'application sortait par l'IPv4 et le système
   par l'IPv6 — un test lancé depuis le serveur était refusé alors que
   l'application passait.
2. Brevo → **Paramètres → Sécurité → onglet IPs autorisées** : les ajouter.
   Une adresse refusée apparaît aussi dans l'onglet *Adresses IP non
   autorisées*, d'où on l'autorise d'un clic.
3. **Ensuite seulement**, sur **SMTP et API → onglet SMTP** : *Activer pour les
   clés SMTP*. Activé avant, il couperait les invitations.

Les deux plages Amazon autorisées automatiquement (`44.249.233.0/24`,
`34.221.60.0/24`) sont très probablement celles de **Bubble**, qui envoie
encore par ce compte.
**Les laisser jusqu'à la bascule**, puis les supprimer après le 5 décembre
2026 : ce sont des plages partagées avec d'autres clients d'Amazon.

## 6. Le suivi des ouvertures et des clics

Brevo → **Paramètres → Emails transactionnels → Suivi** ne propose pas de
couper le suivi, seulement de le rendre **anonyme** : choisir **Oui**. Les
ouvertures et les clics restent comptés en total, mais ne sont plus rattachés
à une personne — rien ne dit plus « tel candidat a ouvert tel courriel ».

Les liens, eux, **ne sont pas réécrits** : vérifié le 8 novembre, un lien de
parrainage reçu commence par `https://essai.mondomaine.fr/parrainage/`. Le
jeton va du courriel à HERACLES sans passer par un redirecteur. À revérifier
si Brevo change ses réglages par défaut.

## 7. Brancher, sur le VPS

### Trois règles, apprises à la mise en service

1. **Des chemins écrits en entier**, jamais de raccourci (`$PILE`, `$DEPOT`).
   Une console rouverte les perd : `nano $DEPOT/.env.essai` ouvre alors
   `/.env.essai`, un fichier neuf à la racine du serveur, et le vrai n'est pas
   touché.
2. **Une ligne sacrifiée en tête de chaque bloc collé** (`echo --- debut`).
   La console web de Hostinger ajoute `[200~` au début d'un collage, ce qui
   casse la première commande ; `[200~echo: command not found` est alors sans
   conséquence.
3. **Une clé ne se colle jamais dans une commande.** Elle se colle à
   l'invite d'un `read -rs`, qui la masque et ne l'inscrit pas dans
   l'historique.

### Une installation neuve

L'adresse d'expédition se donne au script, qui la pose dans le `.env` de la
pile :

```bash
sudo HERACLES_EXPEDITEUR=no-reply@essai.mondomaine.fr \
     ./infra/essai/deployer.sh essai.mondomaine.fr api-essai.mondomaine.fr
```

Il s'arrête ensuite tant que `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` et
`SMTP_ADMIN_EMAIL` ne sont pas renseignés, et dit lesquels manquent.

### Les valeurs sans secret

```bash
echo --- debut
P=/opt/supabase-heracles-essai/.env
F=/opt/heracles-essai-depot/.env.essai
EXP=no-reply@essai.mondomaine.fr
sed -i -e 's|^SMTP_HOST=.*|SMTP_HOST=smtp-relay.brevo.com|' -e 's|^SMTP_PORT=.*|SMTP_PORT=587|' \
       -e 's|^SMTP_USER=.*|SMTP_USER=xxxxxx@smtp-brevo.com|' -e 's|^SMTP_SENDER_NAME=.*|SMTP_SENDER_NAME=HERACLES|' \
       -e "s|^SMTP_ADMIN_EMAIL=.*|SMTP_ADMIN_EMAIL=$EXP|" "$P"
poser() { grep -q "^$1=" "$F" && sed -i "s|^$1=.*|$1=$2|" "$F" || echo "$1=$2" >> "$F"; }
poser COURRIEL_EXPEDITEUR "$EXP"
poser COURRIEL_NOM_EXPEDITEUR HERACLES
grep -q '^BREVO_API_KEY=' "$F" || echo 'BREVO_API_KEY=' >> "$F"
chmod 600 "$F"
```

### Les deux clés

Chaque ligne demande la clé, la masque, vérifie son préfixe et l'écrit au
bon endroit. Coller la ligne, **attendre l'invite**, puis coller la clé.

```bash
echo --- debut; read -rsp "Collez la clé SMTP puis Entrée : " K; echo; K=$(printf %s "$K" | sed 's/\x1b\[20[01]~//g' | tr -d '[:space:]'); case "$K" in xsmtpsib-*) sed -i "s|^SMTP_PASS=.*|SMTP_PASS=$K|" /opt/supabase-heracles-essai/.env;; *) echo "REFUSÉ : une clé SMTP commence par xsmtpsib-";; esac; unset K; grep -qE '^SMTP_PASS=xsmtpsib-' /opt/supabase-heracles-essai/.env && echo "✅ clé SMTP enregistrée" || echo "❌ clé SMTP absente"
```

```bash
echo --- debut; read -rsp "Collez la clé API puis Entrée : " K; echo; K=$(printf %s "$K" | sed 's/\x1b\[20[01]~//g' | tr -d '[:space:]'); case "$K" in xkeysib-*) sed -i "s|^BREVO_API_KEY=.*|BREVO_API_KEY=$K|" /opt/heracles-essai-depot/.env.essai;; *) echo "REFUSÉ : une clé API commence par xkeysib-";; esac; unset K; grep -qE '^BREVO_API_KEY=xkeysib-' /opt/heracles-essai-depot/.env.essai && echo "✅ clé API enregistrée" || echo "❌ clé API absente"
```

### Relancer

```bash
echo --- debut; clear; /opt/heracles-essai-depot/infra/essai/mettre-a-jour.sh 2>&1 | tail -n 25
```

Trois à cinq minutes sans rien afficher : la pile Supabase recrée le service
d'authentification, l'application se reconstruit. La fin attendue :
`l'application répond (HTTP 200 sur /connexion)`.

### Pas de relance

Décision du 8 novembre 2026 : **pas de relance automatique** du parrain
silencieux, ni par n8n ni autrement. Les référents relancent eux-mêmes. Le
code de la relance reste en place, inactif ; `RELANCE_SECRET` se laisse vide,
et la route `/api/relances` répond alors `401` à tout le monde
(`docs/parrainage.md`).

## 8. Vérifier, dans cet ordre

### Sans rien envoyer

Ce bloc ne montre aucune clé : il compare ce que les conteneurs ont lu avec
les fichiers, ouvre une connexion SMTP authentifiée, et interroge l'API
depuis le conteneur de l'application — le chemin réel des courriels.

```bash
echo --- debut; clear
docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' heracles-essai-auth | grep -E '^GOTRUE_SMTP_(HOST|ADMIN_EMAIL)='
python3 - <<'FIN'
import smtplib
d = dict(l.rstrip("\n").split("=", 1) for l in open("/opt/supabase-heracles-essai/.env") if "=" in l and not l.startswith("#"))
s = smtplib.SMTP(d["SMTP_HOST"], int(d.get("SMTP_PORT") or 587), timeout=15); s.starttls(); s.login(d["SMTP_USER"], d["SMTP_PASS"]); s.quit()
print("✅ Brevo accepte la connexion SMTP (clé + adresse IP)")
FIN
docker exec heracles-essai-web-web-1 node -e 'fetch("https://api.brevo.com/v3/account",{headers:{"api-key":process.env.BREVO_API_KEY}}).then(r=>console.log(r.status===200?"✅ API Brevo OK depuis l application":"❌ API : "+r.status))'
```

### Par de vrais envois

Vers une adresse à soi, avec un suffixe (`moi+test1@gmail.com`) : elle arrive
dans la même boîte et n'est inscrite nulle part.

1. **Authentification** — inviter cette adresse depuis HERACLES. Rien
   n'arrive ? `docker logs --tail 100 heracles-essai-auth 2>&1 | grep -i smtp`
2. **Application** — *Candidats → Nouveau candidat*, avec cette adresse comme
   parrain. Rien n'arrive ?
   `docker logs heracles-essai-web-web-1 2>&1 | grep courriel`
   **Ne pas remplir le formulaire reçu** : il ouvrirait un vrai dossier,
   numéroté, au milieu des autres.
3. Dans Gmail : **Boîte de réception** et non Spams ; *Afficher l'original* :
   DKIM et DMARC à `PASS` ; le lien commence par le domaine de l'instance.
4. Brevo a accepté et rien n'arrive : Brevo → **Transactionnel → Journaux**.

## 9. La production

Les mêmes étapes, avec :

- **son domaine** authentifié chez Brevo (§ 2), et son expéditeur (§ 3) ;
- les clés `heracles-prod-…` (§ 4) ;
- canal authentification : `/opt/supabase-heracles/.env`, puis
  `cd /opt/supabase-heracles && docker compose -p heracles-supabase up -d --force-recreate auth` ;
- canal application : le `.env` lu par `infra/docker-compose.prod.yml`
  (`docs/deploiement.md`, § 3), puis
  `docker compose --env-file .env -f infra/docker-compose.prod.yml -p heracles-prod up -d`
  — sans reconstruire : aucune de ces variables n'est figée dans l'image ;
- conteneurs à vérifier : `heracles-auth` et `heracles-prod-web-1`.

## RGPD

Brevo est un sous-traitant : il voit passer les adresses des candidats, des
parrains et des référents, et le texte des courriels. Société française,
hébergement dans l'Union européenne — ce qui simplifie, sans dispenser de
l'inscrire au registre des traitements.
