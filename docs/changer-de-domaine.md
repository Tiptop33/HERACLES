# Changer le nom de domaine — HERACLES sur `oaf-heracles.fr`

- **Date :** 2026-11-27
- **Décision :** HERACLES quitte `essai.oaf-heracles.cloud` pour
  `oaf-heracles.fr`, le domaine de l'application Bubble, et son API passe sur
  `api.oaf-heracles.fr`. Point ouvert n° 3 du cadrage, désormais tranché.
- **Outil :** `infra/essai/changer-de-domaine.sh`, rejouable.
- **Fait le 27 novembre 2026**, en avance sur le 5 décembre : lignes `A` `@` et
  `www` passées sur le VPS chez IONOS, puis le script lancé sur le serveur.
  Vérifié de l'extérieur le même jour :
  - `https://oaf-heracles.fr` répond, avec un certificat Let's Encrypt valable ;
  - `www.oaf-heracles.fr` et `essai.oaf-heracles.cloud` renvoient en 301 vers la
    même page, paramètres compris ;
  - `api.oaf-heracles.fr` refuse qui n'a pas de clé (401), et Studio reste
    fermé (404).

  Les copies de sûreté portent l'horodatage `avant-domaine-20261127-175224`.
- **Ce document ne contient aucun secret.**

## Ce que ce changement veut dire

**Faire pointer `oaf-heracles.fr` vers le VPS, c'est la bascule.** Dès que le
DNS change, celui qui tape `oaf-heracles.fr` arrive sur HERACLES et ne voit
plus Bubble. On ne modifie rien dans Bubble : l'application reste joignable à
son adresse d'origine, `heracles-42268.bubbleapps.io`.

La reprise des données lit l'API de Bubble à cette adresse d'origine
(`outils/import-bubble.mjs`), et les fichiers aux adresses que Bubble a
enregistrées pour eux sur son stockage. Elle n'appelle jamais
`oaf-heracles.fr`. Vérifié le 27 novembre 2026 : l'API de Bubble répond à son
adresse d'origine sans renvoyer vers `oaf-heracles.fr`.

Le changement se fait **le jour de la bascule, après la dernière reprise
complète** (`docs/MAJBUBBLE.md`), et pas avant.

## Les noms, avant et après

| Nom | Avant | Après |
| --- | --- | --- |
| `oaf-heracles.fr` | Bubble | **HERACLES** |
| `www.oaf-heracles.fr` | Bubble | renvoie vers `oaf-heracles.fr` |
| `api.oaf-heracles.fr` | — | **l'API de HERACLES** |
| `essai.oaf-heracles.cloud` | HERACLES | renvoie vers `oaf-heracles.fr`, chemin compris |
| l'ancienne API (`SUPABASE_PUBLIC_URL`) | l'API | n'est plus servie |

**Les liens déjà envoyés continuent de marcher.** Un lien de loge de Guyenne et
Gascogne, de parrainage, de CV anonyme ou de connexion candidat qui commence
par `https://essai.oaf-heracles.cloud/…` aboutit à la même page sur
`oaf-heracles.fr`.

**Ne supprimez pas l'entrée DNS `essai` de `oaf-heracles.cloud`.** Elle porte la
redirection, et c'est aussi le nom sous lequel le déploiement automatique
(`VPS_HOTE`) et la sauvegarde du Mac (`infra/poste/`) joignent le serveur.

## Où se règle le DNS : chez IONOS

`oaf-heracles.fr` est enregistré **chez IONOS**, pas chez Hostinger : le compte
Hostinger ne porte que `oaf-heracles.cloud`, le domaine du site d'essai. La zone
se règle sur ionos.fr → **Domaines & SSL** → `oaf-heracles.fr` → onglet
**DNS**. Chaque ligne s'y modifie par son crayon.

État relevé le 27 novembre 2026 :

| Lignes | Ce qu'elles font | Le jour J |
| --- | --- | --- |
| `MX` (`mx00`, `mx01.ionos.fr`), `TXT` (SPF), les trois `CNAME` `…_domainkey`, `autodiscover`, `_dmarc`, `_domainconnect` | la messagerie IONOS du domaine | **ne jamais y toucher** |
| `A` · `@` → `104.16.42.105` | le site Bubble | → l'adresse du VPS |
| `A` · `www` → `104.16.42.105` | le site Bubble | → l'adresse du VPS |
| `A` · `api` → l'adresse du VPS | l'API de HERACLES | déjà en place, ajoutée le 27 novembre 2026 |

L'adresse du VPS est celle que porte `essai.oaf-heracles.cloud`.

- **Aucune entrée `AAAA` ni `CAA`** : il n'y a rien à supprimer, et rien
  n'empêche Let's Encrypt de délivrer le certificat.
- **Le TTL de `@` et de `www` est déjà de 60 secondes** : rien à abaisser
  avant le jour J. Le changement se propagera en une minute environ.
- **« Protection de domaine est activé »** bloque le transfert du domaine, pas
  les modifications du DNS.

## Avant le jour J

1. **Le script est sur le serveur** depuis la fusion de la PR n° 206, le
   27 novembre 2026. Pour le vérifier :
   ```bash
   ls /opt/heracles-essai-depot/infra/essai/changer-de-domaine.sh
   ```

2. **La ligne `api` est en place** chez IONOS (voir le tableau ci-dessus).
   Elle ne gêne pas Bubble.

3. **La veille, revoir la zone** chez IONOS et la comparer au tableau
   ci-dessus. Faire une capture de toutes les lignes : c'est le plan de
   retour en arrière. Une ligne apparue entre-temps se règle avant le jour J :
   - une `AAAA` sur `@` ou sur `www` : la supprimer ;
   - une `CAA` : y ajouter `0 issue "letsencrypt.org"`.

4. **Vérifier depuis le serveur.** Cette commande ne modifie rien :
   ```bash
   sudo /opt/heracles-essai-depot/infra/essai/changer-de-domaine.sh --verifier oaf-heracles.fr api.oaf-heracles.fr
   ```
   Avant le jour J, elle doit ne signaler que `oaf-heracles.fr` et `www`,
   tous deux encore chez Bubble (104.16.42.105).

## Le jour J

1. **Dernière reprise complète** depuis Bubble (`docs/MAJBUBBLE.md`).

2. **Chez IONOS**, onglet **DNS** de `oaf-heracles.fr`, deux lignes à modifier
   et rien d'autre :
   - la ligne `A` · `@` : crayon, remplacer `104.16.42.105` par l'adresse du
     VPS, enregistrer ;
   - la ligne `A` · `www` : de même.

3. **Attendre que le DNS suive.** Sur le serveur, autant de fois que
   nécessaire :
   ```bash
   sudo /opt/heracles-essai-depot/infra/essai/changer-de-domaine.sh --verifier oaf-heracles.fr api.oaf-heracles.fr
   ```
   Tant qu'un nom ne mène pas au serveur, la commande le nomme et dit
   pourquoi : entrée `A` restée chez Bubble, `AAAA` qui mène ailleurs…

   Un nom créé depuis peu peut rester « sans adresse » une dizaine de minutes,
   même une fois enregistré chez IONOS. Le serveur garde en mémoire la réponse
   « n'existe pas » qu'il a reçue avant la création : cette mémoire dure au
   plus 10 minutes chez IONOS. Constaté le 27 novembre 2026 avec `api`.

   La commande compare le DNS aux adresses que porte la machine
   (`hostname -I`). Sur le VPS Hostinger, l'adresse publique y figure :
   vérifié le 27 novembre 2026. Sur une autre machine où elle n'y figurerait
   pas, `HERACLES_SANS_VERIFIER_DNS=oui` lève ce contrôle, mais seulement après
   avoir vérifié le DNS autrement.

4. **Changer :**
   ```bash
   sudo /opt/heracles-essai-depot/infra/essai/changer-de-domaine.sh oaf-heracles.fr api.oaf-heracles.fr
   ```
   Compter un quart d'heure. Pendant la reconstruction, l'application est
   indisponible quelques minutes. Le script se termine par une vérification
   depuis l'extérieur : le nouveau nom répond, les anciens redirigent, l'API
   refuse qui n'a pas de clé, Studio reste fermé.

5. **Vérifier à la main :** se connecter ; envoyer une invitation de test et
   l'ouvrir ; ouvrir un ancien lien `https://essai.oaf-heracles.cloud/…` et
   constater l'arrivée sur la même page de `oaf-heracles.fr`.

6. **Prévenir les utilisateurs :**
   - chacun se reconnecte une fois : une session ne passe pas d'un nom à
     l'autre, mais les mots de passe ne changent pas ;
   - une invitation, un lien de connexion ou un lien « mot de passe oublié »
     envoyé juste avant le changement passe par l'ancienne API : il faut le
     renvoyer. Ces liens ne valent de toute façon qu'un temps court.

## Ce que fait le script, et dans quel ordre

1. **Vérifie** que le nouveau nom, son `www.` et l'API mènent à ce serveur, en
   IPv4 comme en IPv6. Sinon, il s'arrête sans rien toucher.
2. **Obtient le certificat** des nouveaux noms quand nginx est la façade (avec
   Traefik, c'est Traefik qui l'obtient). Si Let's Encrypt refuse, il s'arrête
   et rien n'a changé.
3. **Garde une copie** de chaque fichier qu'il modifie, en mode 600 :
   `*.avant-domaine-<horodatage>`.
4. **Récrit les adresses :**
   - dans `/opt/supabase-heracles-essai/.env`, celles de l'authentification
     (`SITE_URL`, `SUPABASE_PUBLIC_URL`, `API_EXTERNAL_URL`, et les adresses de
     retour permises, en gardant celles ajoutées à la main) ;
   - dans **chaque** `.env.essai`, celles de l'application, dont celui du
     déploiement automatique. Le fichier oublié aurait remis l'ancien nom à
     la fusion suivante.
5. **Relance `mettre-a-jour.sh`**, qui recrée les services, déclare la
   nouvelle API et reconstruit l'application. `NEXT_PUBLIC_APP_URL` est figée
   à la construction : un simple redémarrage ne suffirait pas.
6. **Pose les redirections** des anciens noms : par une configuration nginx à
   part (`heracles-essai-redirections`), ou par les étiquettes Traefik de
   l'application.
7. **Vérifie de l'extérieur**, en retentant chaque contrôle le temps que la
   configuration prenne effet.

Il est **rejouable** : relancé avec les mêmes noms, il ne refait que ce qui
manque.

### Les deux garde-fous

- `mettre-a-jour.sh` — donc chaque déploiement automatique — **refuse de
  construire** si le nom lu dans `.env.essai` diffère de celui de la pile.
  Construite ainsi, l'application servirait un nom pendant que les courriels
  d'invitation en indiqueraient un autre, et plus personne ne pourrait entrer.
- `deployer.sh` **refuse de tourner sous d'autres noms** que ceux de
  l'instance installée. Relancé avec les anciens noms, il aurait défait le
  changement.

## Ce qui ne change pas

- **L'adresse d'où partent les courriels** reste `no-reply@essai.oaf-heracles.cloud`,
  déjà authentifiée chez Brevo. Passer à une adresse en `@oaf-heracles.fr` est
  une étape à part, à faire après la bascule et pas le même jour :
  authentifier `oaf-heracles.fr` chez Brevo (`docs/brevo.md`, § 2), en posant
  ses enregistrements chez IONOS. Un domaine n'a droit qu'à **un seul**
  enregistrement SPF. Or `oaf-heracles.fr` a déjà le sien, celui de sa
  messagerie IONOS (`v=spf1 include:_spf-eu.ionos.com ~all`) : il faudra y
  ajouter Brevo, et non en créer un second.
- **Les noms internes** — dossier `heracles-essai`, ports 3003 et 8101 —
  restent ceux de l'essai. C'est une dette de nommage, sans effet sur le
  service.
- **Les secrets GitHub** `VPS_HOTE` et `VPS_EMPREINTE`, tant que l'entrée
  `essai` reste en place.

## Revenir en arrière

1. Chez IONOS, remettre `104.16.42.105` dans les lignes `A` · `@` et
   `A` · `www` de `oaf-heracles.fr`, comme sur la capture de la veille. La
   ligne `api` peut rester : elle ne gêne pas Bubble.
2. Une fois le DNS revenu, relancer le script vers les anciens noms :
   ```bash
   sudo /opt/heracles-essai-depot/infra/essai/changer-de-domaine.sh essai.oaf-heracles.cloud <ancienne-api>
   ```
   `<ancienne-api>` est la valeur de `SUPABASE_PUBLIC_URL` dans la copie
   `/opt/supabase-heracles-essai/.env.avant-domaine-<horodatage>`. Le script
   cesse de lui-même de rediriger `oaf-heracles.fr`, qui ne mène plus au
   serveur.

Si le script s'est arrêté en cours de route, il affiche les commandes qui
remettent les copies de sûreté en place.

## Points d'attention

- **HSTS sur tout le domaine.** L'application envoie
  `Strict-Transport-Security` avec `includeSubDomains`. Servi depuis
  `oaf-heracles.fr`, cet en-tête oblige pendant un an tout navigateur venu sur
  le site à n'ouvrir **aucun** sous-domaine de `oaf-heracles.fr` autrement
  qu'en HTTPS. C'est sans effet aujourd'hui, mais un futur sous-domaine servi
  en clair serait inaccessible. Rien n'est changé ici.
- **Les adresses de Bubble** (`oaf-heracles.fr/renseignement_candidat/…`,
  `/version-test/…`) tomberont sur une page introuvable de HERACLES. Les
  courriels envoyés par Bubble ne mènent donc plus nulle part, ce qui aurait
  été le cas de toute façon à l'arrêt de Bubble.
- **Les modèles de courriel de parrainage** retirent encore les liens
  `oaf-heracles.fr`, un reste de Bubble (`apps/web/src/lib/parrainage.ts`,
  `LIEN_BUBBLE`). Après la bascule, un lien vers HERACLES écrit à la main dans
  un modèle serait remplacé par le lien du formulaire. Les liens que HERACLES
  fabrique ne sont pas concernés.
- **La connexion par Google**, si elle est un jour activée : l'adresse de
  rappel déclarée dans la console Google devient
  `https://api.oaf-heracles.fr/auth/v1/callback`.
