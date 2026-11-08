# Les courriels : paramétrer Brevo

- **Date :** 2026-11-08
- **Ce document ne contient aucun secret.** Les clés se créent chez Brevo, se
  collent dans les `.env` du VPS, et n'en sortent pas.
- Les noms de menus de Brevo sont ceux connus à cette date. L'interface bouge :
  si un menu a changé de nom, l'étape reste la même.

## Deux canaux, deux clés

HERACLES envoie des courriels par deux chemins qui ne se connaissent pas.
Brevo sert les deux, mais **avec deux clés différentes** — et les inverser est
l'erreur la plus fréquente.

| Canal | Ce qu'il envoie | Qui envoie | Par où | Ce qu'il lit |
| --- | --- | --- | --- | --- |
| **Authentification** | invitations, réinitialisation de mot de passe | GoTrue, dans la pile Supabase | SMTP | `SMTP_*` dans `/opt/supabase-heracles[-essai]/.env` |
| **Application** | lien au parrain, lien au candidat, relance à 24 h | Next.js — `apps/web/src/lib/courriel.ts` | API HTTPS | `BREVO_API_KEY`, `COURRIEL_EXPEDITEUR`, `COURRIEL_NOM_EXPEDITEUR` |

Sans le premier, **personne n'entre** : on n'entre qu'invité. Sans le second,
le parcours « nouveau candidat » fonctionne encore — le lien s'affiche au
référent, qui le transmet à la main (`docs/parrainage.md`).

**Compter 48 heures** entre la création du compte et le premier envoi : la
validation du compte par Brevo et la propagation DNS ne se pressent pas.

## 1. Le compte

- Bubble employait déjà Brevo. **Le même compte peut servir, pas les mêmes
  clés.** Des clés propres à HERACLES se révoquent à la fermeture de Bubble
  sans rien couper ici.
- Compléter le profil de l'organisation : un compte neuf peut rester « en
  cours de vérification » et ne rien envoyer, sans erreur bien visible.
- **Plan gratuit : 300 courriels par jour.** Largement assez en régime normal.
  Le jour de la bascule, si l'on invite tout le monde à la fois, étaler sur
  deux jours ou prendre un mois payant.

## 2. Authentifier le domaine

C'est le prérequis qui bloque tout le reste. **Une adresse `@gmail.com` ne
peut pas être expéditrice** : sa politique DMARC fait rejeter par Gmail et
Yahoo tout courriel qui s'en réclame sans venir de Google. Il faut le domaine
de HERACLES.

1. Brevo → **Expéditeurs, domaines et IP dédiées → Domaines → Ajouter un
   domaine** : le domaine **racine** (`mondomaine.fr`), pas celui de l'essai.
2. Brevo affiche trois ou quatre enregistrements DNS — code de vérification
   (`TXT brevo-code:…`), DKIM, DMARC. **Recopier exactement ce qu'il affiche**,
   et non un tutoriel : leur forme a changé avec le temps.
3. Hostinger → **hPanel → Domaines → DNS / Serveurs de noms** : ajouter les
   enregistrements, puis revenir à Brevo → **Authentifier**.
4. Sans DMARC existant, commencer par
   `v=DMARC1; p=none; rua=mailto:dmarc@mondomaine.fr`, durcir ensuite.

## 3. L'expéditeur

Brevo → **Expéditeurs → Ajouter** : `no-reply@mondomaine.fr`, nom
« HERACLES ».

Une seule adresse sert les deux canaux. Côté application, chaque courriel
affiche le nom de la loge et, quand un référent en est à l'origine, le désigne
pour recevoir les réponses ; l'adresse d'envoi, elle, ne change pas.

**Elle ne se déduit pas du domaine de l'application.** `composer-env.sh`
écrivait autrefois `no-reply@essai.mondomaine.fr` : un sous-domaine que
personne n'avait authentifié, refusé par Brevo sans que l'application le
dise. L'adresse se donne désormais à l'installation (§ 7), et `deployer.sh`
prévient s'il retrouve l'ancienne valeur.

## 4. Les clés — une paire par instance

Brevo → **SMTP & API** :

| Onglet | Préfixe | Variable | Nom à lui donner |
| --- | --- | --- | --- |
| **SMTP** → *Générer une clé SMTP* | `xsmtpsib-…` | `SMTP_PASS` | `heracles-essai-gotrue` |
| **Clés API** → *Générer une clé* | `xkeysib-…` | `BREVO_API_KEY` | `heracles-essai-web` |

Puis la même paire pour la production : `heracles-prod-gotrue`,
`heracles-prod-web`. L'essai se révoque alors sans toucher à la production.

Sur l'onglet SMTP figure aussi l'**identifiant** de connexion, de la forme
`xxxxxx@smtp-brevo.com`. C'est lui qui va dans `SMTP_USER` — pas l'adresse
avec laquelle on se connecte à Brevo.

| Symptôme | Cause |
| --- | --- |
| `535 Authentication failed` dans le journal de `auth` | clé API dans `SMTP_PASS`, ou adresse de connexion dans `SMTP_USER` |
| `401` dans le journal de `web` | clé SMTP dans `BREVO_API_KEY`, ou IP non autorisée (§ 5) |

## 5. Autoriser l'adresse IP du VPS

Brevo refuse les appels d'API venus d'une adresse qu'il ne connaît pas.

- Sur le VPS : `curl -4 ifconfig.me` donne l'adresse publique.
- Brevo → **Paramètres → Sécurité → IP autorisées** : l'ajouter.

Inutile d'y mettre l'adresse du bureau : rien n'appelle l'API depuis un poste.

## 6. Couper le suivi des clics et des ouvertures

Par défaut, Brevo réécrit chaque lien pour compter les clics, et ajoute un
pixel pour compter les ouvertures. Pour HERACLES, non :

- **les liens portent des jetons** — `/parrainage/<jeton>`,
  `/candidature/<jeton>`, `/invitation/…`. Ce sont des secrets à usage unique ;
  ils n'ont pas à transiter par le redirecteur d'un tiers ;
- **le pixel** trace qui ouvre quoi, chez des personnes vulnérables. Rien dans
  le service rendu ne le justifie.

Brevo → **Transactionnel → Paramètres** : désactiver le suivi des clics et des
ouvertures. Si l'option n'y est pas, le signaler : l'envoi peut aussi le
demander message par message, dans le code.

## 7. Brancher

**Les secrets se saisissent dans un éditeur**, pas par
`echo … >> fichier` : ils finiraient dans l'historique du shell.

### Une installation neuve

L'adresse d'expédition se donne au script, qui la pose dans le `.env` de la
pile :

```bash
sudo HERACLES_EXPEDITEUR=no-reply@mondomaine.fr \
     ./infra/essai/deployer.sh essai.mondomaine.fr api-essai.mondomaine.fr
```

Il s'arrête ensuite tant que `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` et
`SMTP_ADMIN_EMAIL` ne sont pas renseignés, et dit lesquels manquent.

### Le canal authentification

`sudo nano /opt/supabase-heracles-essai/.env` :

```env
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=xxxxxx@smtp-brevo.com
SMTP_PASS=xsmtpsib-…
SMTP_SENDER_NAME=HERACLES
SMTP_ADMIN_EMAIL=no-reply@mondomaine.fr
```

Puis, pour que le service relise son environnement :

```bash
cd /opt/supabase-heracles-essai && docker compose -p heracles-essai up -d --force-recreate auth
```

### Le canal application

`sudo nano /opt/heracles-essai-depot/.env.essai`, à la fin :

```env
BREVO_API_KEY=xkeysib-…
COURRIEL_EXPEDITEUR=no-reply@mondomaine.fr
COURRIEL_NOM_EXPEDITEUR=HERACLES
RELANCE_SECRET=<openssl rand -hex 32>
```

Puis `sudo /opt/heracles-essai-depot/infra/essai/mettre-a-jour.sh`.
`deployer.sh` réécrit ce fichier mais garde ces quatre lignes.

### La relance horaire

Sans tâche planifiée, la relance à 24 h ne part jamais. Le détail est dans
`docs/parrainage.md` ; avec n8n : un *Schedule Trigger* toutes les heures, un
*HTTP Request* `POST https://essai.mondomaine.fr/api/relances`, et le secret
dans un *credential* de type *Header Auth* (`Authorization` /
`Bearer <RELANCE_SECRET>`) — pas en clair dans le nœud.

## 8. Vérifier, dans cet ordre

```bash
# La clé d'API et l'adresse IP. 200 : bon. 401 : mauvaise clé, ou IP refusée.
set -a; . /opt/heracles-essai-depot/.env.essai; set +a
curl -sS -o /dev/null -w '%{http_code}\n' https://api.brevo.com/v3/account -H "api-key: $BREVO_API_KEY"

# Le port 587 sort bien du VPS.
timeout 5 openssl s_client -starttls smtp -connect smtp-relay.brevo.com:587 </dev/null 2>/dev/null \
  | grep -m1 'Verify return'
```

1. **Authentification** — inviter une adresse à soi depuis HERACLES. Rien
   n'arrive ?
   `docker logs --tail 100 heracles-essai-auth 2>&1 | grep -i smtp`
2. **Application** — *Candidats → Nouveau candidat*, avec son adresse comme
   parrain. Rien n'arrive ?
   `docker logs heracles-essai-web-web-1 2>&1 | grep courriel`
3. **Délivrabilité** — une invitation vers l'adresse que donne
   mail-tester.com : viser 9/10 au moins. Dans Gmail, *Afficher l'original* :
   DKIM et DMARC à `PASS`.
4. Brevo a accepté et rien n'arrive : Brevo → **Transactionnel → Journaux**.

## 9. La production

Les mêmes étapes, avec les clés `heracles-prod-…` :

- canal authentification : `/opt/supabase-heracles/.env`, puis
  `cd /opt/supabase-heracles && docker compose -p heracles-supabase up -d --force-recreate auth` ;
- canal application : le `.env` lu par `infra/docker-compose.prod.yml`
  (`docs/deploiement.md`, § 3), puis un `up -d` du projet `heracles-prod` —
  sans reconstruire : aucune de ces variables n'est figée dans l'image ;
- une seconde tâche n8n pour la relance, vers le domaine de production.

## RGPD

Brevo est un sous-traitant : il voit passer les adresses des candidats, des
parrains et des référents, et le texte des courriels. Société française,
hébergement dans l'Union européenne — ce qui simplifie, sans dispenser de
l'inscrire au registre des traitements.
