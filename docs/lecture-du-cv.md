# La lecture du CV

Sur sa fiche (`/candidature/<jeton>`), le candidat choisit d'abord son CV. Le
formulaire se remplit alors à partir de son contenu : coordonnées, recherche,
permis, formation, expériences, compétences. Le candidat relit, complète, puis
envoie. C'est Claude, le modèle d'Anthropic, qui lit le CV.

## Ce qui se passe

1. Le candidat choisit son fichier. Le navigateur l'envoie à
   `POST /api/candidature/<jeton>/lecture-cv`, avant l'envoi de la fiche.
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

Si la lecture échoue (clé absente, format non lu, panne), le candidat le voit
sous le champ et remplit à la main. La fiche s'envoie dans tous les cas.

## Formats

| Format | Lu ? |
| --- | --- |
| PDF | oui, tel quel |
| Photo JPEG, PNG, WebP | oui, jusqu'à 5 Mo (limite de l'API) |
| Word `.docx` | oui, par son texte (extrait avec `mammoth`) |
| Word `.doc`, OpenDocument, RTF | non : le CV est joint, la fiche se remplit à la main |

## Données personnelles — à régler avant la mise en service

Le CV quitte le serveur pour être lu par Anthropic, aux États-Unis. Le candidat
en est prévenu à côté du champ CV. Trois points restent à régler, et ils ne
relèvent pas du code :

1. **Le contrat avec Anthropic.** Accepter les conditions commerciales et
   l'accord de traitement des données (DPA) de l'organisation Anthropic qui
   porte la clé. Vérifier la durée de conservation des requêtes sur ce compte,
   et demander la conservation zéro (*zero data retention*) si elle est
   possible.
2. **Le registre des traitements.** Y inscrire Anthropic comme sous-traitant
   et le transfert hors de l'Union européenne.
3. **Le texte du consentement**, en bas du formulaire. Il dit que les documents
   « ne sont lus que par les membres de la commission ». Le CV est désormais
   aussi lu par Anthropic pour remplir la fiche. À reformuler si l'on veut
   lever toute ambiguïté : c'est une modification de l'écran, qui se décide.

## Configuration

Une variable, côté serveur seulement :

| Variable | Rôle |
| --- | --- |
| `ANTHROPIC_API_KEY` | la clé de l'API d'Anthropic (`console.anthropic.com` → *API Keys*), qui commence par `sk-ant-` |

Créer une clé **propre à HERACLES**, et poser une **limite de dépense**
mensuelle sur l'espace de travail qui la porte. Une clé se révoque sans toucher
au reste.

**Sur l'instance d'essai**, ajouter la ligne à la main dans
`/opt/heracles-essai-depot/.env.essai`, puis
`sudo /opt/heracles-essai-depot/infra/essai/mettre-a-jour.sh`. `deployer.sh`
réécrit ce fichier mais conserve `ANTHROPIC_API_KEY`, comme les réglages de
Brevo.

**Sans clé**, rien ne part. Le candidat lit « La lecture automatique n'est pas
disponible » et remplit sa fiche à la main, comme avant cette fonction.

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
