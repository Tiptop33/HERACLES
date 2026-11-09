# La lecture du CV

Sur sa fiche (`/candidature/<jeton>`), le candidat choisit d'abord son CV : le
champ est en tête du formulaire. S'il clique ensuite sur **« Remplir le
formulaire à partir de mon CV »**, le formulaire se remplit à partir de son
contenu : coordonnées, recherche, permis, formation, expériences, compétences.
Le candidat relit, complète, puis envoie. C'est Claude, le modèle d'Anthropic,
qui lit le CV.

**Rien ne part sans ce clic.** Choisir son fichier ne fait que le joindre à la
fiche. C'est le geste du candidat qui vaut accord pour transmettre son CV à
Anthropic. Il en est prévenu sous le bouton, et la case de consentement le
rappelle.

## Ce qui se passe

1. Le candidat choisit son fichier, puis clique sur « Remplir ». Le navigateur
   l'envoie à `POST /api/candidature/<jeton>/lecture-cv`, avant l'envoi de la
   fiche.
2. La route vérifie le jeton, la limite de lectures, la taille et le format du
   fichier (lu dans ses octets), puis transmet le CV à l'API d'Anthropic.
3. Claude rend un objet JSON. Chaque case vaut `null` quand le CV ne la
   renseigne pas.
4. La réponse est nettoyée avant de revenir au formulaire. Une adresse e-mail mal formée,
   un âge hors de 14 à 99 ans, une valeur hors des listes du formulaire, tout
   cela est écarté (`nettoyerLecture`, dans `apps/web/src/lib/lecture-cv.ts`).
5. Le formulaire ne remplit **que les cases vides**. Ce que le candidat a tapé,
   ou ce que le parrain avait déjà donné (nom, prénom, e-mail, type de
   recherche), n'est jamais écrasé.

Le CV est ensuite joint à la fiche comme avant, à l'envoi, par la route
habituelle. **La lecture n'enregistre rien.** Ni le fichier ni ce qui en est
tiré ne sont conservés par HERACLES, et le journal ne note que la nature d'un
échec, jamais un contenu.

Si la lecture échoue (format non lu, panne), le candidat le voit sous le bouton
et remplit à la main. La fiche s'envoie dans tous les cas.

## Formats

| Format | Lu ? |
| --- | --- |
| PDF | oui, tel quel |
| Photo JPEG, PNG, WebP | oui, jusqu'à 5 Mo (limite de l'API) |
| Word `.docx` | oui, par son texte (extrait avec `mammoth`) |
| Word `.doc`, OpenDocument, RTF | non : le CV est joint, la fiche se remplit à la main |

## La photo

Quand le CV contient une photo de la personne, le formulaire la montre sous le
bouton après la lecture, avec **« Ne pas garder cette photo »**. Gardée, elle
part avec la fiche et devient la photo du dossier
(`candidat/photo/<identifiant>.<format>`) : la fiche du référent l'affiche, par
la route qui sert déjà les photos de candidats.

**Le partage des rôles.** Le serveur de HERACLES sort du fichier les images
qui pourraient être une photo (`apps/web/src/lib/photo-du-cv.ts`). Claude les
voit numérotées à la suite du CV, et **désigne** celle qui est la photo de la
personne — ou aucune. Choisir sur la seule forme ne suffit pas : le 9 novembre,
un QR code carré, plus grand que tout le reste, a été pris pour une photo dans
un CV qui n'en avait pas. Ces images font partie du CV que Claude lit déjà :
rien de plus ne part.

Ce que le serveur sait sortir :

- dans un PDF, ses images enregistrées en JPEG — la façon dont Word,
  LibreOffice, Canva ou un navigateur rangent une photo. Une image compressée
  autrement n'est pas reconstruite : pas de photo, plutôt qu'une image fausse ;
- dans un Word `.docx`, ses images JPEG et PNG ;
- dans un CV photographié, rien : c'est une image entière.

Sont écartés avant d'être montrés : les icônes, les logos très allongés, les
pages numérisées et les fichiers de plus de 2 Mo ; six images au plus, des
plus grandes aux plus petites. Si l'API refuse une image, la lecture se refait
sans elles : le formulaire se remplit, sans photo.

Sans photo envoyée, celle que le dossier avait déjà (reprise de Bubble)
reste en place (migration 0066).

## Données personnelles — à régler avant la mise en service

Quand le candidat clique sur « Remplir », son CV quitte le serveur pour être lu
par Anthropic, aux États-Unis. Il en est prévenu sous le bouton, et la case de
consentement ajoute : « Si j'ai demandé à remplir ce formulaire à partir de mon
CV, celui-ci a aussi été transmis à Anthropic pour être lu par Claude. »

Ce qui encadre ce transfert, relevé le 9 novembre 2026 :

- **Le contrat.** L'accord de traitement des données (DPA) d'Anthropic, du
  24 février 2025, fait partie des conditions commerciales de l'API : il n'y a
  rien à signer à part. Il contient les clauses contractuelles types de l'UE
  pour le transfert vers les États-Unis. Pour un client de l'EEE, le
  cocontractant est Anthropic Ireland, Limited.
  <https://www.anthropic.com/legal/data-processing-addendum>
- **La conservation.** Anthropic supprime les requêtes et les réponses sous
  30 jours, et ne s'en sert pas pour entraîner ses modèles. La conservation
  zéro se demande à son équipe commerciale.
- **Le lieu.** L'espace de travail « HERACLES » de la console est restreint au
  traitement aux États-Unis (zone d'inférence « US », facturée 1,1 fois le
  tarif mondial).
- **Le registre.** Le traitement y est inscrit :
  `docs/rgpd/registre-des-traitements.md`, § 5.

## Configuration

Une variable, côté serveur seulement :

| Variable | Rôle |
| --- | --- |
| `ANTHROPIC_API_KEY` | la clé de l'API d'Anthropic (`platform.claude.com` → *Clés et accès*), qui commence par `sk-ant-` |

La clé se crée **dans l'espace de travail « HERACLES »** de la console, et non
dans l'espace par défaut que partagent d'autres projets. Cet espace a sa propre
limite de dépense : 10 $ par mois. Une clé se révoque sans toucher au reste.

**Sur l'instance d'essai**, ajouter la ligne à la main dans
`/opt/heracles-essai-depot/.env.essai`, puis
`sudo /opt/heracles-essai-depot/infra/essai/mettre-a-jour.sh`. `deployer.sh`
réécrit ce fichier mais conserve `ANTHROPIC_API_KEY`, comme les réglages de
Brevo.

**Sans clé**, rien ne part et rien ne s'affiche : ni le bouton « Remplir », ni
la mention d'Anthropic, ni la phrase ajoutée au consentement. Le CV reste en
tête du formulaire, et le candidat remplit sa fiche à la main. La page lit la
clé à chaque affichage : la poser ou la retirer suffit, sans reconstruire
l'image.

## Coût

Le modèle est `claude-opus-5-5`, au tarif de 4 $ par million de jetons en
entrée et 20 $ en sortie. L'effort est réglé sur `low` : recopier un CV dans
des cases demande peu de réflexion, et le candidat attend devant l'écran.

Il faut compter de l'ordre de **0,05 à 0,10 € par CV**. C'est une estimation :
le chiffre réel se lit dans la console d'Anthropic, au poste *Usage*.

Chaque lien de candidature a droit à **cinq lectures par quart d'heure**
(`LECTURES_PAR_FENETRE`, dans la route). La limite protège la facture d'un
abus. Elle est tenue en mémoire : un redémarrage la remet à zéro.

## En cas de panne

```bash
docker logs heracles-essai-web-web-1 2>&1 | grep lecture-cv
```

| Message | Cause |
| --- | --- |
| `clé ANTHROPIC_API_KEY refusée` | clé fausse, révoquée, ou espace de travail sans crédit |
| `limite de débit atteinte` | trop de lectures en même temps pour le compte |
| `erreur de l'API <code>` | panne passagère chez Anthropic, ou requête refusée |
| `lecture refusée <catégorie>` | un filtre de sécurité a refusé la lecture, même après le modèle de repli |
| `réponse incomplète` | le CV était trop long pour la réponse prévue |
