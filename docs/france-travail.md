# La réception des offres de France Travail

Les **offres** d'emploi viennent de France Travail. Jusqu'au 23 novembre 2026,
HERACLES ne les tenait que de la reprise de Bubble — et Bubble n'en recevait
plus depuis le 25 mai : aucune n'était « en cours », l'écran « France Travail »
était vide. Depuis la migration 0099, HERACLES les reçoit lui-même. C'est la
« réception France Travail » du lot 4.

## Ce qui se passe

```
minuterie (toutes les 3 h)          mise en ligne
        │                                 │
        └──► infra/essai/recevoir-offres.sh ◄──┘
                      │  POST, secret partagé, boucle locale
                      ▼
        /api/offres/recevoir            (application web)
                      │  1. vérifie le secret
                      │  2. demande un jeton à France Travail
                      │  3. cherche les offres : par département, jour par jour
                      │  4. remet chaque page à la base, clé de service
                      ▼
        recevoir_offres_france_travail(jsonb)      (migration 0099)
                      │  met à jour l'offre connue, crée l'autre
                      ▼
                 offre_emploi
```

- **Quelles offres** : celles créées dans les départements suivis — par défaut
  les quatre de l'application Bubble, **33, 40, 47, 64**. `FRANCE_TRAVAIL_DEPARTEMENTS`
  en donne d'autres (`24,33,40,47,64`).
- **Depuis quand** : depuis la dernière offre connue, plus un jour de
  recouvrement ; deux jours au moins, trente et un au plus. Au-delà de trente
  jours une offre n'est plus « en cours » (migrations 0011 et 0097) : la
  recevoir ne servirait à rien.
- **Reconnaître une offre** : par l'identifiant que France Travail lui donne
  (`offre_emploi.source_id`). Une offre reprise de Bubble que France Travail
  renvoie est mise à jour, et garde son `bubble_id`.
- **Une offre vit soixante jours.** Une offre que France Travail ne renvoie
  plus cesse d'être actualisée : elle sort des offres en cours au bout de
  trente jours, et elle est supprimée au bout de soixante (voir « La purge »).
- **Le contact du recruteur n'est pas gardé** — nom, courriel, téléphone. Aucun
  écran n'en a besoin ; l'offre porte l'adresse de sa page d'origine.

Ce qui part chez France Travail : les identifiants de l'application, un numéro
de département, deux dates. Rien d'un candidat ni d'un référent — le registre
des traitements n'a pas à changer.

## La purge

Chaque réception terminée se conclut par la suppression des offres de plus de
**soixante jours** (migration 0101, `purger_les_offres_anciennes`). L'âge d'une
offre est sa date d'actualisation chez France Travail ; à défaut sa date de
création ; à défaut le jour où HERACLES l'a reçue.

- Entre trente et soixante jours, une offre n'est plus à l'écran mais reste en
  base : une marge, si France Travail la réactualise.
- La première purge a emporté les quelque 4 500 offres reprises de Bubble,
  toutes antérieures au 25 mai 2026. **Rejouer la reprise des offres Bubble les
  ramène, et la réception suivante les supprime de nouveau** : c'est voulu, ces
  offres ne sont plus à pourvoir.
- La fonction refuse moins de trente et un jours : une faute de frappe ne peut
  pas vider les offres en cours.
- Une purge qui échoue ne fait pas échouer la réception : le bilan porte alors
  `"purgees":null`, et le journal de l'application la ligne `[offres] purge
  impossible`.
- La suppression est définitive. Les sauvegardes nocturnes (`docs/sauvegarde.md`)
  gardent la table telle qu'elle était.
- **Les offres saisies à la main sont épargnées** (migration 0114) : sorties
  de la liste au bout de trente jours, elles attendent qu'on les prolonge ou
  qu'on les retire (`docs/offres-saisies.md`).
- **Le jour où une offre pourra être proposée à un candidat (lot 4), cette
  purge devra épargner les offres proposées.** Aujourd'hui, aucune table ne
  désigne une offre.

## Les identifiants

Ils viennent d'une application déclarée sur **francetravail.io** (espace
« Partenaires »), abonnée à l'API **« Offres d'emploi v2 »**. Le site donne
alors un *identifiant client* et une *clé secrète*. Si l'application Bubble
avait les siens, ils conviennent : ce sont les mêmes.

Ils se rangent sur le serveur, dans `/opt/heracles-essai-depot/.env.essai`,
**jamais dans le dépôt** :

| Variable | Ce que c'est |
| --- | --- |
| `FRANCE_TRAVAIL_CLIENT_ID` | l'identifiant client de l'application |
| `FRANCE_TRAVAIL_CLIENT_SECRET` | sa clé secrète |
| `FRANCE_TRAVAIL_DEPARTEMENTS` | facultatif — `33,40,47,64` si la ligne est vide ou absente |
| `RECEPTION_OFFRES_SECRET` | le secret de la route ; `installer-reception-offres.sh` le fabrique |

`deployer.sh` conserve ces quatre lignes quand il réécrit le fichier.

## Mettre en service

Sur le serveur, une fois les deux identifiants rangés dans `.env.essai` :

```bash
sudo /opt/heracles-essai-depot/infra/essai/installer-reception-offres.sh
```

Il fabrique le secret de la route, redémarre l'application pour qu'elle lise
ses réglages, pose la minuterie `heracles-offres.timer` (toutes les trois
heures) et reçoit tout de suite le mois écoulé — quelques minutes.

Sans systemd, la même chose avec `cron` :

```
17 */3 * * * /opt/heracles-essai-depot/infra/essai/recevoir-offres.sh >/dev/null
```

## Vérifier, rejouer

```bash
systemctl status heracles-offres.timer        # la minuterie tourne ?
journalctl -u heracles-offres -n 40           # la dernière réception ?
sudo ./infra/essai/recevoir-offres.sh         # recevoir maintenant
sudo ./infra/essai/recevoir-offres.sh --jours 31   # tout le mois écoulé
```

Chaque passage affiche le bilan que la route renvoie — des compteurs, rien
d'autre :

```
{"ok":true,"jours":2,"recues":412,"creees":96,"mises_a_jour":316,"appels":14,
 "fenetres_lues":8,"fenetres_prevues":8,"plafonnees":0,"termine":true,"purgees":187}
```

| Champ | Ce qu'il dit |
| --- | --- |
| `recues`, `creees`, `mises_a_jour` | les offres rangées par ce passage |
| `appels` | les recherches faites à France Travail |
| `fenetres_lues` / `fenetres_prevues` | un département × un jour, c'est une fenêtre |
| `plafonnees` | les fenêtres qui dépassaient ce que l'API accepte de rendre (3 150 offres) — au-delà de zéro, des offres manquent ce jour-là |
| `termine` | `false` : les quatre minutes se sont écoulées ; le script rappelle la route, qui reprend où elle s'est arrêtée |
| `purgees` | les offres de plus de soixante jours supprimées à la fin de ce passage ; `0` tant que la réception n'est pas terminée, `null` si la purge a échoué |

Quand ça échoue, la réponse dit l'étape :

| `etape` | À regarder |
| --- | --- |
| `jeton` (souvent `401`) | les identifiants : recopiés en entier ? l'application est-elle abonnée à l'API « Offres d'emploi v2 » ? |
| `recherche` | France Travail a refusé ou ne répond pas — le code HTTP est dans `statut` |
| `depot` | la base a refusé la page : `docker compose -p heracles-essai-web logs --tail 50` |

HTTP `401` sur la route elle-même : le secret ne correspond pas, ou il est
absent — la route est alors fermée à tout le monde, et c'est voulu. HTTP `503` :
les identifiants France Travail manquent.

## Les entreprises qui recrutent (La Bonne Boîte)

Sous l'onglet « Profil » de la fiche d'un candidat, le bloc **« Entreprises qui
recrutent »** (décision du 24 novembre 2026) liste les dix entreprises que
France Travail juge les plus susceptibles de recruter dans les six mois, dans
les secteurs du candidat et son département. Rien à saisir : la liste se
déduit de la fiche. Chaque nom mène à la fiche de l'établissement dans
l'Annuaire des entreprises (`annuaire-entreprises.data.gouv.fr`), où chercher
un contact — La Bonne Boîte n'en donne aucun.

```
fiche (onglet Profil) ──► GET /api/candidats/<id>/entreprises
                               │  1. session
                               │  2. fiche et secteurs, lus sous RLS
                               │  3. secteurs → divisions NAF, code postal → département
                               ▼
              api.francetravail.io/partenaire/labonneboite/v2/recherche
```

- **API** : « La Bonne Boîte v2 » (spécification v2.27.3 lue le 24 novembre
  2026), accès libre, licence Etalab, **deux appels par seconde**.
- **Portée du jeton** : `api_labonneboitev2 search office`. L'application
  déclarée sur francetravail.io doit être **abonnée aussi à La Bonne Boîte** —
  mêmes identifiants `FRANCE_TRAVAIL_*`, rien de plus dans `.env.essai`.
- **Ce qui part** : des divisions NAF et un numéro de département. Jamais un
  nom ni un identifiant de candidat.
- **Secteurs** : une division telle quelle, une section dépliée en ses
  divisions (NAF rév. 2), dans l'ordre des secteurs, quarante au plus.
- **Lieu** : le département du code postal de la fiche (Corse : 2A/2B ;
  outre-mer : 971 à 976). Pas de rayon autour de la commune : il faudrait
  géocoder l'adresse — une évolution possible.
- **Rien en base.** Le jeton est gardé vingt minutes, chaque liste une heure,
  en mémoire du processus ; un redémarrage les oublie.
- **Qui la voit** : qui lit les secteurs de la fiche, donc la fiche elle-même.
  La route ne répond rien à qui ne la lit pas.

Quand la liste manque, le bloc dit pourquoi : pas de secteur, pas de code
postal, identifiants absents, ou France Travail indisponible (le journal de
l'application porte alors `[la bonne boîte] recherche <statut>`).

## Les offres en alternance (La bonne alternance)

Sous l'onglet « Profil » de la fiche d'un candidat qui cherche une alternance
(« Stage en alternance »), le bloc **« Offres en alternance »** (décision du
24 novembre 2026, option a) liste les dix premières offres de La bonne
alternance pour son métier, à moins de **30 km** de sa commune. Rien à
saisir : le métier recherché et le code postal de la fiche suffisent. Chaque
titre ouvre l'offre, où l'on postule.

```
fiche (onglet Profil) ──► GET /api/candidats/<id>/alternance
                               │  1. session ; fiche lue sous RLS
                               │  2. métier recherché ──► ROMEO (France Travail) ──► codes ROME
                               │  3. code postal ──► /geographie/v1/commune/search ──► centre de la commune
                               ▼
              api.apprentissage.beta.gouv.fr/api/job/v1/search  (ROME, position, 30 km)
```

- **API** : « Recherche d'opportunités d'emploi en alternance », Mission
  interministérielle de l'apprentissage (spécification lue le 24 novembre
  2026). Gratuite, **usage non lucratif**, 60 recherches par minute. Elle
  rassemble les offres déposées sur La bonne alternance et celles de ses
  partenaires, dont France Travail.
- **Deux accès** :
  - **ROMEO** (francetravail.io, portée `api_romeov2`) traduit le métier écrit
    sur la fiche en **un** code ROME, le plus probable (décision du 24 novembre
    2026 : en retenir jusqu'à trois ramenait des offres hors sujet). Le bloc
    le nomme en tête — « Métier reconnu : … » — pour qu'on sache d'où viennent
    les offres ; s'il est faux, préciser le métier sur la fiche. Mêmes
    identifiants `FRANCE_TRAVAIL_*` ; abonner l'application à ROMEO.
  - **`LA_BONNE_ALTERNANCE_CLE`** : une clé « production » créée sur
    api.apprentissage.beta.gouv.fr (compte, profil). Lire ne demande aucune
    habilitation. À ranger dans `.env.essai` ; `deployer.sh` la conserve.
- **Ce qui part** : l'intitulé du métier chez France Travail ; le code postal,
  le code ROME et le centre de la commune (pas l'adresse) chez la Mission
  apprentissage. Jamais un nom ni un identifiant de candidat.
- **Rien en base.** En mémoire : le jeton ROMEO vingt minutes, les codes ROME
  d'un métier et la position d'une commune un jour, chaque liste une heure.
- **Le téléphone du recruteur**, que l'API rend parfois, n'est pas repris : le
  lien mène à l'offre, où il figure.
- **Qui la voit** : qui lit la fiche ; la route ne répond rien aux autres.

Quand la liste manque, le bloc dit pourquoi : pas de métier, pas de code
postal, métier non reconnu par ROMEO, commune introuvable, clé absente, ou
service indisponible (journal : `[la bonne alternance] <message> <statut>`).

## Ce qui reste à savoir

- **Jamais joué contre la vraie API avant la première mise en service.** Le
  code a été écrit d'après la documentation de l'API et éprouvé contre une
  fausse ; les adresses, la portée du jeton et la forme des réponses sont à
  confirmer au premier passage réel. Le bilan et les codes d'erreur ci-dessus
  sont là pour ça.
- **Les offres créées, pas les offres actualisées.** La recherche se fait par
  date de création. Une offre créée il y a deux mois et simplement actualisée
  hier n'est pas reçue.
- **Les conditions d'utilisation de l'API** — mention de la source, logo,
  durée de conservation — sont à relire sur francetravail.io : elles
  s'appliquent à l'écran « France Travail », dont le logo tient lieu de titre ;
  la source est aussi nommée dans le détail de chaque offre (« Voir l'offre
  sur France Travail »).
- **La purge ignore encore les offres proposées.** Elle supprime toute offre
  de plus de soixante jours ; quand un référent pourra proposer une offre à un
  candidat (lot 4), il faudra qu'elle épargne celles-là.
- **La Bonne Boîte, ROMEO et La bonne alternance répondent** : premier essai
  réel le 24 novembre 2026 sur le site d'essai, les deux blocs de la fiche
  affichent leurs listes. L'adresse du jeton de notre code
  (`entreprise.francetravail.fr`) sert donc aussi La Bonne Boîte et ROMEO.
- **La pertinence des offres en alternance** reste à juger sur quelques
  fiches : le métier écrit sur la fiche est parfois vague (« SECRETARIAT DE
  DIRECTION »), et le code ROME que ROMEO en tire décide des offres. Premier
  retour, le 24 novembre : « en partie » pertinentes avec trois métiers ;
  ramené à un seul, et affiché, le même jour.
- **L'instance de production** n'existe pas encore : ces scripts sont ceux de
  l'essai. La mise en ligne du lot 6 reprendra la même minuterie.
