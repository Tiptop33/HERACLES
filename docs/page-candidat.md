# La page du candidat

Depuis la migration 0105 (25 novembre 2026), le candidat a sa page dans HERACLES. Il y tient sa
fiche à jour, y dépose ses CV et ses lettres de motivation, y voit les offres France Travail de
ses secteurs et y dit à son référent où il en est. Maquette validée :
[`maquettes/page-candidat.html`](maquettes/page-candidat.html).

## Les décisions du 25 novembre 2026

| Question | Décision |
| --- | --- |
| Comment le candidat se connecte-t-il ? | Par un **lien reçu par courriel**, sans mot de passe |
| Qui l'invite ? | **Les deux** : HERACLES à la fin de la candidature ; le référent (ou le parrain) par un bouton sur la fiche, pour les dossiers déjà suivis |
| Quelles offres voit-il ? | Celles de **ses secteurs d'activité**, dans **les départements qu'il coche** — les règles de l'écran France Travail |
| Qui lit ses messages ? | **Son référent et son parrain**, et eux seuls |
| Où le référent les lit-il ? | Dans un **bloc à part**, « Messages du candidat », en tête de l'onglet Suivi |
| Quand un message ne se corrige-t-il plus ? | **24 heures après son écriture** |
| Le référent est-il prévenu ? | **Oui, par courriel, à chaque message** — sans le texte |
| Le candidat supprime-t-il un document ? | **Oui, pour de bon** — fichier compris |
| Combien de documents ? | **Cinq CV et cinq lettres** au plus, un principal de chaque |
| Le référent voit-il tous les documents ? | **Oui, tous** |
| Sa photo ? | **Oui**, il la pose, la change, la retire ; c'est celle que la fiche montre déjà |
| Quand la mettre en service ? | **Avant la bascule du 5 décembre**, ouverte tout de suite |

## Le parcours

```
référent : « Inviter Inès à sa page »          candidature complétée
                 │                                       │
                 └──────────► courriel d'invitation ◄────┘
                              /invitation-candidat/<jeton>   (30 jours, une fois)
                                         │  « Ouvrir mon espace » (POST)
                                         ▼
                 compte de l'adresse de la fiche — créé s'il n'existe pas
                 accepter_l_invitation_a_la_page : la fiche porte le compte
                                         │
                                         ▼
                                 /espace/chercheur
                                         ▲
   visites suivantes : /connexion/lien → courriel → /connexion/lien/ouvrir (une fois, peu de temps)
```

- **C'est l'adresse à laquelle l'invitation est partie qui désigne le compte**, jamais une
  adresse saisie à l'ouverture du lien. Si la fiche change d'adresse entre-temps, le lien ne
  vaut plus. Un compte ne rejoint une fiche que par l'invitation envoyée à l'adresse de cette
  fiche.
- **Un compte de candidat que rien ne relie encore est recréé à neuf** à l'acceptation : il a
  pu être ouvert, avec un mot de passe, par quelqu'un d'autre au temps où l'inscription était
  libre. L'inscription est fermée en production (`DISABLE_SIGNUP`), c'est une seconde barrière.
- **Une invitation n'ouvre de session que la première fois.** Pour un compte déjà relié, elle
  renvoie vers « Recevoir un lien de connexion » : un lien d'invitation qui circule ne donne
  pas le compte d'un candidat. Et le référent ne reçoit le lien à transmettre que si le
  courriel n'est pas parti, pour un espace pas encore ouvert.
- Une adresse qui est déjà celle d'un compte de référent est refusée : il faut une autre
  adresse sur la fiche.
- **Un bouton, pas le lien lui-même**, ouvre la session : les messageries d'entreprise
  ouvrent les liens d'un courriel pour les vérifier, et consommeraient un jeton à usage
  unique avant la personne.
- Le lien de connexion est fabriqué par GoTrue (`generateLink`) mais **envoyé par
  HERACLES**, avec sa page d'arrivée : il s'ouvre sur n'importe quel appareil. Il ne part
  qu'aux comptes de candidats reliés à une fiche (`generateLink` créerait sinon le compte),
  trois au plus par quart d'heure et par adresse. La réponse part avant l'envoi (`after`) : sa
  durée ne trahit pas les adresses connues. Le lien vaut ce que valent les liens de GoTrue
  (`GOTRUE_MAILER_OTP_EXP`) — voir « Ce qui reste ».

## Ce que le candidat voit, et ce qu'il ne voit pas

Il n'a **aucun droit de lecture** sur la table `candidat`. Sa fiche lui vient de
`ma_fiche_de_candidat()`, qui nomme ses colonnes, et repart champ par champ par
`modifier_ma_fiche_de_candidat(champ, valeur)`, dans une liste fermée. Il ne voit jamais
l'appréciation, l'urgence, ce qu'il sait de l'appartenance du parrain, si un membre peut se
dévoiler, ni sa loge.

L'**adresse électronique** est affichée, pas modifiable : elle sert à se connecter. Pour en
changer, le référent la change sur la fiche — et le candidat continue de se connecter avec
l'adresse de son compte (voir « Ce qui reste »).

La **situation familiale** ne propose que l'état civil, « Célibataire » compris. La liste de
Bubble commence par « le fils, la fille, la femme, la concubine » : le lien avec le parrain,
qui n'a rien à faire sur la page du candidat. Une valeur reprise reste affichée tant qu'il ne
la change pas.

Les **secteurs** qu'il ajoute servent tout de suite à ses offres, et attendent la confirmation
de son référent, comme dans le formulaire de candidature. Ce qui était confirmé le reste.

## Les documents

- `candidat_document` : cinq CV et cinq lettres au plus, un principal de chaque, rangés dans
  le seau privé sous `candidat/documents/<candidat>/<uuid>.<format>` ; format lu dans les
  octets, 10 Mo au plus.
- **Le principal est recopié** dans `candidat.cv_chemin` et `lettre_motivation_chemin` : la
  fiche du référent, le CV anonyme, l'affiche et la suppression d'un dossier lisent toujours
  là. Dans l'autre sens, un chemin posé sur la fiche par la candidature devient un document.
  Les CV et lettres déjà rangés ont été repris par la migration.
- Supprimer le principal donne la place au plus récent. Une suppression retire le fichier du
  seau : il n'y a pas de corbeille.

## Les messages

- `candidat_message` : corrigeables **24 heures**, puis la base refuse toute modification
  (déclencheur `candidat_message_correction`). Un message naît à l'heure de son écriture,
  jamais antidaté ; il ne s'efface pas, sauf avec son dossier. La clé de service n'a que la
  lecture : ni écriture, ni effacement, ni `truncate`. Supprimer le compte d'un candidat
  laisse ses messages, sans auteur.
- Vingt par jour au plus : chacun envoie un courriel au référent.
- Le courriel au référent nomme le candidat et son numéro, et renvoie à l'onglet Suivi de sa
  fiche. **Le texte n'y est jamais recopié.** Sans référent (une nouvelle demande), personne
  n'est prévenu.

## Les offres

`offres_pour_moi()` : les offres en cours (30 jours) dont la division ou la section NAF est
l'un de ses secteurs, confirmés ou non. Les départements cochés sont retenus
(`page_candidat.departements`) ; avant tout choix, celui de son code postal ; aucun coché,
tous. « Nouvelle » : parue depuis sa visite précédente — une visite commence après trente
minutes sans rien, pour qu'un clic sur un filtre n'éteigne pas les badges.

Depuis la migration 0114 (27 novembre 2026), les offres **saisies à la main** par les
référents y paraissent aussi, avec l'étiquette de leur type (Emploi, Stage, Alternance), leur
durée et le contact à joindre ; une offre rangée dans un grand secteur (« F ») parvient au
candidat qui cherche dans l'une de ses divisions (« 43 »). La phrase du bloc dit désormais
« Les offres en cours dans vos secteurs d'activité. » Voir `docs/offres-saisies.md`.

## Ce que la relecture de sécurité a fait changer

Une relecture indépendante, le 25 novembre, a trouvé et fait corriger :

- **une porte ouverte depuis 0006** : `rattacher_referent_au_compte` n'avait jamais été
  fermée. Toute session pouvait se rattacher une fiche de référent libre — avec la page
  candidat, chaque candidat a une session. Fermée ; un test vérifie désormais qu'aucune
  fonction `security definer` ne reste ouverte à tous ;
- **les chemins de fichiers** d'une fiche ne s'écrivent plus depuis une session
  (`candidat_chemins_proteges`), et un chemin qui n'est pas celui du candidat
  (`chemin_de_ce_candidat`) ne devient pas un document ni ne s'efface du seau ;
- **être connecté ne veut plus dire être membre** : le collège, les réglages (dates et lieux
  des réunions, modèles de courriels) et la mise en page des documents ne se lisent plus
  qu'en référent ou en administrateur. Le test de 0002 qui disait l'inverse a été mis à jour.

## Les écrans et les routes

| Où | Quoi |
| --- | --- |
| `/espace/chercheur` | la page (offres, fiche, « Où j'en suis », documents) |
| `/connexion/lien`, `/connexion/lien/ouvrir` | demander un lien, l'ouvrir |
| `/invitation-candidat/<jeton>` | accepter l'invitation |
| `/api/espace-candidat/…` | fiche, secteurs, documents, messages, départements, photo |
| `/api/candidats/<id>/page-candidat` | le bouton « Inviter … à sa page » de la fiche |
| `/espace/referent/candidats/<id>/documents/<doc>` | un document ouvert par le référent |

Sur la fiche du référent : l'état de la page sous l'en-tête (pas encore invité, invitation
envoyée ou expirée, page ouverte et dernière visite) avec le bouton d'invitation ; tous les
documents sous l'onglet Documents ; « Messages du candidat » en tête de l'onglet Suivi, pour
son référent et son parrain.

## Ce qui reste

- **Changer d'adresse.** Le candidat ne change pas son adresse lui-même. Si le référent la
  change sur une fiche déjà reliée, le compte garde l'ancienne : le candidat se connecte avec
  elle. Pour la nouvelle, renvoyer l'invitation : la fiche est alors reliée au compte de la
  nouvelle adresse.
- **Supprimer un dossier qui a un compte** reste refusé, comme depuis 0062 (« compte ») :
  les dossiers des candidats qui ont ouvert leur page ne se suppriment plus depuis l'écran.
  À trancher avec la procédure des droits (registre, § 10).
- **Le plafond des liens** vit en mémoire : un redémarrage de l'application le remet à zéro.
- **La durée du lien de connexion** n'est réglée nulle part : c'est la valeur par défaut de
  GoTrue qui s'applique. À fixer (`GOTRUE_MAILER_OTP_EXP` dans la composition de la pile
  Supabase), puis à écrire dans le courriel et sur l'écran, qui disent seulement « pour peu de
  temps ». La page « Mot de passe oublié » annonce trente minutes : même réglage.
- **Le consentement** des fiches reprises de Bubble : l'invitation pourrait le recueillir
  (registre, § 4 bis).
- **Les secteurs ajoutés par le candidat** n'envoient rien au référent : il les voit « à
  confirmer » en ouvrant la fiche.
