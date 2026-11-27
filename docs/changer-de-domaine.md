# Changer le nom de domaine — HERACLES sur `oaf-heracles.fr`

- **Date :** 2026-11-27
- **Décision :** HERACLES quitte `essai.oaf-heracles.cloud` pour
  `oaf-heracles.fr`, le domaine de l'application Bubble, et son API passe sur
  `api.oaf-heracles.fr`. Point ouvert n° 3 du cadrage, désormais tranché.
- **Outil :** `infra/essai/changer-de-domaine.sh`, rejouable.
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

## Avant : la veille, ou plus tôt

1. **Fusionner la PR qui apporte le script**, puis laisser passer le
   déploiement automatique. Vérifier qu'il est arrivé :
   ```bash
   ls /opt/heracles-essai-depot/infra/essai/changer-de-domaine.sh
   ```
   Ce déploiement ne change rien à l'écran : la redirection qu'il pose reste
   inactive tant qu'aucun ancien nom n'est déclaré.

2. **Trouver la zone DNS de `oaf-heracles.fr`.** hPanel → **Noms de domaine** →
   `oaf-heracles.fr` → **DNS / Serveurs de noms**. Ce n'est pas le
   « Gestionnaire DNS » du VPS (`docs/brevo.md`, « Les deux pièges »). Si
   `oaf-heracles.fr` n'apparaît pas dans **Noms de domaine**, le domaine est
   géré ailleurs : les mêmes changements se font chez cet hébergeur-là.

3. **Faire une capture de toutes les entrées de la zone.** C'est le plan de
   retour en arrière.

4. **Abaisser le TTL** des entrées `@` et `www` (A, AAAA, CNAME) à `300`. Le
   jour J, le changement se propagera en cinq minutes au lieu de plusieurs
   heures.

5. **Regarder les entrées `CAA`.** S'il y en a et qu'aucune ne mentionne
   `letsencrypt.org`, ajouter `CAA` · `@` · `0 issue "letsencrypt.org"`. Sinon
   le certificat sera refusé.

6. **Ajouter tout de suite** l'entrée `A` · `api` · l'adresse du VPS (celle que
   porte déjà `essai` dans la zone `oaf-heracles.cloud`). Elle ne gêne pas
   Bubble.

7. **Ne pas toucher** aux entrées `MX` et `TXT` : elles servent le courrier
   du domaine, s'il en a un.

## Le jour J

1. **Dernière reprise complète** depuis Bubble (`docs/MAJBUBBLE.md`).

2. **Dans la zone de `oaf-heracles.fr` :**
   - `@` : une seule entrée `A`, l'adresse du VPS, à la place de celles de
     Bubble ;
   - `www` : un `CNAME` vers `oaf-heracles.fr` (ou un `A` vers l'adresse du VPS) ;
   - **supprimer toutes les entrées `AAAA`** de `@` et de `www`. Celles de
     Bubble enverraient les accès en IPv6 chez Bubble, et Let's Encrypt
     échouerait.

3. **Attendre que le DNS suive.** Sur le serveur, autant de fois que
   nécessaire — cette commande ne change rien :
   ```bash
   sudo /opt/heracles-essai-depot/infra/essai/changer-de-domaine.sh --verifier oaf-heracles.fr api.oaf-heracles.fr
   ```
   Tant qu'un nom ne mène pas au serveur, elle le nomme et dit pourquoi
   (entrée `A` restée chez Bubble, `AAAA` oubliée…). Elle compare le DNS aux
   adresses que porte la machine (`hostname -I`). Si l'adresse publique n'y
   figure pas, ce qui n'est pas le cas chez Hostinger, et seulement après
   avoir vérifié le DNS autrement : `HERACLES_SANS_VERIFIER_DNS=oui` lève ce
   contrôle.

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
  authentifier `oaf-heracles.fr` chez Brevo (`docs/brevo.md`, § 2). Un domaine
  n'a droit qu'à **un seul** enregistrement SPF : si `oaf-heracles.fr` envoie
  déjà du courrier, il faut compléter l'existant, pas en ajouter un second.
- **Les noms internes** — dossier `heracles-essai`, ports 3003 et 8101 —
  restent ceux de l'essai. C'est une dette de nommage, sans effet sur le
  service.
- **Les secrets GitHub** `VPS_HOTE` et `VPS_EMPREINTE`, tant que l'entrée
  `essai` reste en place.

## Revenir en arrière

1. Dans la zone de `oaf-heracles.fr`, remettre les entrées relevées la veille.
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
