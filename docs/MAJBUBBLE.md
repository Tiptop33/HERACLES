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
| **Sauvegarder** | `sudo /opt/heracles-essai-depot/infra/essai/sauvegarder.sh`, et **sortir l'archive du VPS** — voir [`sauvegarde.md`](sauvegarde.md) |
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

**Rattacher les comptes.** Les fiches arrivent de Bubble ; les comptes de
connexion, eux, existent déjà. Rien ne les lie tant qu'on ne le demande pas :

```bash
docker exec -i <prefixe>-db psql -U postgres -d postgres \
  -c "select public.rattacher_les_comptes_orphelins() as comptes_rattaches"
```

Elle rapproche les adresses identiques, ne touche qu'une fiche libre, ne
déplace jamais un rattachement existant, et se rejoue sans risque. Un compte
sans fiche ne voit ni collègues, ni candidats : c'est à faire le jour même.

**Refermer l'API Bubble** et régénérer ses jetons. Voir
`docs/reprise-bubble-releve.md`.

## Ce que MAJBUBBLE ne fait pas

**Les mots de passe.** Bubble ne les expose pas, et c'est heureux. Les 71
référents ne pourront pas se connecter avec le leur : chacun doit recevoir une
invitation et en choisir un nouveau. **Cela ne s'improvise pas le jour J** —
c'est un envoi groupé à préparer, et un délai à laisser aux gens.

**Les rattachements manquants.** Douze référents ne sont dans aucune loge. Dans
HERACLES, un référent sans loge ne voit rien : ni collègues, ni candidats en
attente, ni documents. À corriger avant la bascule, pas après. L'annuaire les
regroupe : *Référents*, puis la loge « Sans loge » — et chaque fiche se corrige
sur place.

**Les sept types vides.** `appels`, `tag`, `tenue`, `ft_auth`,
`offre_cliquee`, `emailrelance`, `candidat_offre_cliquee` : zéro enregistrement
au 4 août. À revérifier le jour venu, ils ont pu se remplir depuis.

**Les tâches, et tout ce que l'API n'expose pas.** Vérifié le 7 août 2026 :
`/api/1.1/meta` ne rend que sept types — `candidats`, `user`,
`loges_referents`, `info_entreprise`, `offreemploi`, `pdfs`, `global`. Trois
colonnes de notre modèle pointent vers des types absents de cette liste :
`candidat.taches_bubble_ids` (`TACHES`), `referent.canaux_bubble_ids`
(`Channels`), `parametre.whatsapp_bubble_ids` (`WHATSAPP`).

*Ce que ça coûte, mesuré :* **une tâche, sur 107 candidats.** Un seul candidat
en porte une. Il n'y a donc pas d'historique de suivi à sauver — contrairement
à ce que cette page a d'abord annoncé. Exposer `TACHES` avant la bascule reste
propre (Data → Data types, « expose via API »), mais ce n'est pas une urgence :
c'est une ligne.

**En revanche, `ARCHIVER` ne doit pas être perdu — et il l'est aujourd'hui.**
Relevé du 7 août sur les 107 fiches Bubble :

| `ARCHIVER` | fiches |
| --- | ---: |
| `Oui` | 94 |
| `Non` | 13 |

Aucune fiche n'est vide. Or dans HERACLES, la colonne `candidat.archive` est
nulle. L'import la prévoit pourtant (`import-bubble.mjs`, `ARCHIVER →
archive`) : la reprise en base date d'avant cette correspondance, ou n'a pas
été rejouée depuis.

Ces treize « Non » sont les candidats **en cours** — et c'est exactement le
« 13 en cours » que la maquette 1c annonce en tête de son volet. Sans cette
colonne, le poste de travail présente 107 dossiers actifs au lieu de 13.

*À faire :* rejouer l'import sur l'instance d'essai, puis vérifier :

```sql
select coalesce(archive, '∅') as archive, count(*)
  from public.candidat group by 1 order by 2 desc;
```

Trois valeurs attendues, et pas de `∅`.

**Les listes de choix, enfin relevées.** Leurs valeurs manquaient au modèle du
4 août ; elles sont dans `docs/specs/2026-08-04-modele-bubble.md`. `ARCHIVER`
est un oui/non — d'où la précaution posée dans `apps/web/src/lib/suivi.ts` :
une valeur qui commence par une négation ne referme rien. Sans elle, les
treize « Non » auraient été comptés comme archivés.

## Compte rendu

Le jour où MAJBUBBLE est passée, noter dans `docs/reprise-bubble-releve.md` :
la date, les comptes obtenus, les écarts constatés et leur explication. Le
relevé du 4 août sert de modèle.
