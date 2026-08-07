# MAJBUBBLE — la reprise finale des données Bubble

- **Nom retenu :** `MAJBUBBLE`
- **Échéance :** au plus tard le **5 décembre 2026**, jour de la bascule
- **À faire aussi :** au moins une fois **à blanc**, deux semaines avant

La reprise du 4 août a servi à modeler la base. Elle sera périmée le jour venu :
quatre mois de fiches modifiées, de candidats entrés, d'offres renouvelées. Il
faut la rejouer une dernière fois, au plus près de la bascule.

C'est **la seule opération de la mise en ligne qui ne se rattrape pas** : passé
la fermeture de l'application Bubble, ni son API ni son CDN ne répondent plus.
Ce qui n'a pas été repris ce jour-là est perdu.

## La commande

```bash
sudo /opt/heracles-essai-depot/infra/essai/reprendre-bubble.sh --fichiers
```

Elle enchaîne trois temps, et elle est **rejouable** — une fiche déjà reprise
est mise à jour, jamais dupliquée :

1. **Les tables métier**, depuis la base Bubble *en service* : candidats,
   référents, loges, offres, documents, entreprises, paramètres.
2. **Les référentiels**, depuis la base de *l'éditeur*, en `SEULEMENT_BRUT=1` —
   les deux bases n'exposent pas les mêmes types, et la seconde ne doit pas
   écraser la première.
3. **Les fichiers**, du CDN de Bubble vers le stockage Supabase. Reprenable :
   interrompue, relancée, elle repart où elle en était.

Sur la production, remplacer le chemin par celui du dépôt de production.

## Avant de la lancer

| | |
| --- | --- |
| **Sauvegarder** | `docker exec <prefixe>-db pg_dump -U postgres postgres \| gzip > heracles-avant-majbubble.sql.gz`, et **sortir le fichier du VPS** |
| **L'API Bubble doit répondre** | si elle a été refermée entre-temps, la rouvrir avec un jeton pour la durée de l'opération, et la refermer après |
| **Un jeton** | `BUBBLE_TOKEN=xxx sudo -E …` — l'API répond aussi sans, mais c'est à éviter |
| **La pile doit être en marche** | migrations jouées, `auth` en place |

## Après

**Compter.** La commande finit par un tableau. Le comparer aux comptes de
Bubble, relevés le même jour :

```
https://heracles-42268.bubbleapps.io/api/1.1/obj/<type>?limit=1
```

Le champ `remaining` du JSON, plus un, donne le total. Un écart n'est pas
forcément une erreur — une fiche peut avoir été supprimée entre les deux
lectures — mais il doit s'expliquer.

**Vérifier que les fichiers sont bien passés.** Tant qu'une colonne
`..._chemin` est vide alors que son `..._url` ne l'est pas, le fichier reste à
rapatrier. La migration `0005_fichiers.sql` porte les requêtes de contrôle.

**Refermer l'API Bubble** et régénérer ses jetons. Voir
`docs/reprise-bubble-releve.md`.

## Ce que MAJBUBBLE ne fait pas

**Les mots de passe.** Bubble ne les expose pas, et c'est heureux. Les 71
référents ne pourront pas se connecter avec le leur : chacun doit recevoir une
invitation et en choisir un nouveau. **Cela ne s'improvise pas le jour J** —
c'est un envoi groupé à préparer, et un délai à laisser aux gens.

**Les rattachements manquants.** Douze référents ne sont dans aucune loge. Dans
HERACLES, un référent sans loge ne voit rien : ni collègues, ni candidats en
attente, ni documents. À corriger avant la bascule, pas après.

**Les sept types vides.** `appels`, `tag`, `tenue`, `ft_auth`,
`offre_cliquee`, `emailrelance`, `candidat_offre_cliquee` : zéro enregistrement
au 4 août. À revérifier le jour venu, ils ont pu se remplir depuis.

## Compte rendu

Le jour où MAJBUBBLE est passée, noter dans `docs/reprise-bubble-releve.md` :
la date, les comptes obtenus, les écarts constatés et leur explication. Le
relevé du 4 août sert de modèle.
