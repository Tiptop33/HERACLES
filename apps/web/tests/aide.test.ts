import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LARGEUR_DE_TELEPHONE,
  PARCOURS,
  cheminDe,
  etapeDArrivee,
  parcoursDuRole,
  texteDeLEtape,
} from '../src/lib/aide/parcours';
import { PAS_MINIMAL, marcheEntre } from '../src/lib/aide/marche';
import { CATALOGUES, EXEMPLES, parcoursDuCatalogue } from '../src/lib/aide/parcours-publics';
import { placer } from '../src/lib/aide/placement';
import { chercherDesParcours, motsUtiles, normaliser } from '../src/lib/aide/recherche';
import {
  REPRISE_AU_PLUS_TARD_MS,
  etapeSuivante,
  reprendreLaVisite,
  retenirLaVisite,
} from '../src/lib/aide/visite';
import {
  MINUTES_DE_LA_FENETRE,
  PROPOSITIONS_AU_PLUS,
  QUESTIONS_PAR_FENETRE,
  QuestionDAide,
  catalogueDuRenfort,
  demandeDeRenfort,
  retenir,
} from '../src/lib/aide/renfort';
import { FAMILLES, PARAMETRES, famillesDuRole } from '../src/lib/navigation';
import { RUBRIQUES } from '../src/lib/parametres';
import type { Role } from '../src/lib/roles';

const SRC = join(__dirname, '..', 'src');

/** Tout le code des écrans, lu une fois : c'est là que vivent les ancres. */
function lireLesSources(dossier: string): string {
  return readdirSync(dossier)
    .map((nom) => {
      const chemin = join(dossier, nom);
      if (statSync(chemin).isDirectory()) return lireLesSources(chemin);
      return nom.endsWith('.tsx') ? readFileSync(chemin, 'utf8') : '';
    })
    .join('\n');
}

const SOURCES = lireLesSources(SRC);
const POSTE = readFileSync(join(SRC, 'lib', 'poste.ts'), 'utf8');
const FICHE = readFileSync(join(SRC, 'app', 'espace', 'candidats', 'PanneauFiche.tsx'), 'utf8');

/** Les adresses que la colonne de gauche offre réellement à ce rôle. */
function adressesDuMenu(role: Role): string[] {
  const entrees: (string | null)[] = famillesDuRole(role).flatMap((f) => f.entrees.map((e) => e.vers));
  // « Accueil » est en tête de colonne, hors des familles, pour tout le monde.
  entrees.push('/espace/accueil');
  // Les paramètres sont réservés à l'administration (layout des paramètres).
  if (role === 'admin') entrees.push(PARAMETRES.vers);
  return entrees.filter((v): v is string => v !== null);
}

describe('le catalogue de l’aide', () => {
  it('donne à chaque parcours un identifiant unique et au moins une étape', () => {
    const ids = PARCOURS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of PARCOURS) expect(p.etapes.length, p.id).toBeGreaterThan(0);
  });

  it('ne cite que des ancres qui existent dans le code', () => {
    for (const parcours of PARCOURS) {
      for (const etape of parcours.etapes) {
        const ancre = etape.ancre;
        if (ancre === null) continue;
        const ou = `${parcours.id} → ${ancre}`;

        if (ancre.startsWith('menu:')) {
          // Vérifiée par rôle, dans le test suivant ; ici, que la colonne les pose.
          expect(SOURCES, ou).toContain('data-aide={`menu:${');
        } else if (ancre.startsWith('vue:')) {
          expect(SOURCES, ou).toContain('data-aide={`vue:${valeur}`}');
          expect(POSTE, ou).toContain(`valeur: '${ancre.slice(4)}'`);
        } else if (ancre.startsWith('onglet:')) {
          expect(FICHE, ou).toContain('data-aide={`onglet:${o.valeur}`}');
          // Un onglet encore éteint (« lot 4 ») ne porte pas d'ancre.
          expect(FICHE, ou).toMatch(new RegExp(`valeur: '${ancre.slice(7)}', libelle: '[^']+' \\}`));
        } else if (ancre.startsWith('eteint:')) {
          expect(SOURCES, ou).toContain('data-aide={`eteint:${entree.libelle}`}');
          // L'entrée doit exister, et être encore éteinte. Le jour où son
          // écran arrive, ce test casse : le parcours « pas encore en
          // service » est devenu faux, il faut écrire le vrai.
          const entree = FAMILLES.flatMap((f) => f.entrees).find(
            (e) => e.libelle === ancre.slice(7),
          );
          expect(entree, ou).toBeDefined();
          expect(entree?.vers, ou).toBeNull();
        } else if (ancre.startsWith('rubrique-eteinte:')) {
          expect(SOURCES, ou).toContain('data-aide={`rubrique-eteinte:${r.libelle}`}');
          // Même garde-fou : la rubrique doit exister et être encore éteinte.
          const rubrique = RUBRIQUES.find((r) => r.libelle === ancre.slice(17));
          expect(rubrique, ou).toBeDefined();
          expect(rubrique?.vers, ou).toBeNull();
        } else if (ancre.startsWith('onglet-eteint:')) {
          expect(FICHE, ou).toContain('data-aide={`onglet-eteint:${o.valeur}`}');
          expect(FICHE, ou).toMatch(
            new RegExp(`valeur: '${ancre.slice(14)}', libelle: '[^']+', lot: '`),
          );
        } else if (ancre.startsWith('rubrique:')) {
          expect(SOURCES, ou).toContain('data-aide={`rubrique:${r.vers}`}');
          // Une rubrique encore éteinte n'a pas d'adresse, donc pas d'ancre.
          expect(RUBRIQUES.map((r) => r.vers), ou).toContain(ancre.slice(9));
        } else {
          expect(SOURCES, ou).toContain(`data-aide="${ancre}"`);
        }
      }
    }
  });

  it('ne guide un rôle que vers des entrées de menu qu’il voit', () => {
    for (const role of ['referent', 'admin'] as const) {
      const visibles = adressesDuMenu(role);
      for (const parcours of parcoursDuRole(role)) {
        for (const etape of parcours.etapes) {
          if (!etape.ancre?.startsWith('menu:')) continue;
          expect(visibles, `${role} · ${parcours.id}`).toContain(etape.ancre.slice(5));
        }
      }
    }
  });

  it('n’emmène que vers des écrans de l’application', () => {
    for (const p of PARCOURS) {
      if (p.destination === null) continue;
      expect(cheminDe(p.destination), p.id).toMatch(/^\/(espace\/|mon-compte$)/);
    }
  });

  it('ne propose rien à un candidat connecté', () => {
    expect(parcoursDuRole('chercheur')).toEqual([]);
  });

  it('réserve à l’administration ce qui lui revient', () => {
    const duReferent = parcoursDuRole('referent').map((p) => p.id);
    expect(duReferent).not.toContain('parametres');
    expect(duReferent).not.toContain('invitations');
    expect(duReferent).toContain('nouveau-candidat');
    expect(parcoursDuRole('admin').map((p) => p.id)).toContain('nouveau-candidat-admin');
  });

  it('reprend « Emmène-moi » sur une étape qui existe', () => {
    for (const p of PARCOURS) {
      expect(etapeDArrivee(p), p.id).toBeGreaterThanOrEqual(0);
      expect(etapeDArrivee(p), p.id).toBeLessThan(p.etapes.length);
    }
  });
});

describe('la recherche de l’aide', () => {
  const duReferent = parcoursDuRole('referent');
  const premier = (question: string) => chercherDesParcours(question, duReferent)[0]?.id;

  it('retire les accents, la ponctuation et les mots creux', () => {
    expect(normaliser('Clôturés ?')).toBe('clotures');
    expect(motsUtiles('Comment puis-je avoir la liste de mes candidats ?')).toEqual([
      'list',
      'mes',
      'candidat',
    ]);
  });

  it.each([
    ['comment puis-je avoir la liste de mes candidats', 'mes-candidats'],
    ['Où sont mes candidats ?', 'mes-candidats'],
    ['je cherche un candidat par son nom', 'chercher-un-candidat'],
    ['ajouter un nouveau candidat', 'nouveau-candidat'],
    ['où est le CV anonyme', 'documents-du-candidat'],
    ['télécharger la lettre de motivation', 'documents-du-candidat'],
    ['noter un entretien dans le suivi', 'suivi-du-candidat'],
    ['dossiers archivés', 'dossiers-archives'],
    ['où sont les dossiers clôturés', 'dossiers-clotures'],
    ['rouvrir un dossier clôturé', 'rouvrir-un-dossier'],
    ['faire l’appel de la réunion', 'faire-l-appel'],
    ['imprimer le compte rendu', 'creer-le-compte-rendu'],
    ['comment créer un compte rendu', 'creer-le-compte-rendu'],
    ['faire le compte-rendu de la réunion', 'creer-le-compte-rendu'],
    ['faire l’affiche de la réunion', 'creer-l-affiche'],
    ['créer une affiche', 'creer-l-affiche'],
    ['comment sortir l’affichette de la réunion', 'creer-l-affichette'],
    ['créer une affichette', 'creer-l-affichette'],
    ['comment créer le compte rendu, l’affiche et l’affichette', 'documents-de-la-reunion'],
    ['produire les documents de la réunion', 'documents-de-la-reunion'],
    ['où retrouver un ancien compte rendu', 'documents-de-la-commission'],
    ['fermer la feuille d’appel', 'faire-l-appel'],
    ['l’affichette d’un candidat', 'imprimer-la-fiche'],
    ['changer mon mot de passe', 'mot-de-passe'],
    ['changer mon numéro de téléphone', 'mon-compte'],
    ['retirer ma photo', 'retirer-ma-photo'],
    ['comment me déconnecter', 'se-deconnecter'],
    ['trouver un référent', 'annuaire-des-referents'],
    ['clôturer un dossier', 'cloturer-un-dossier'],
    ['le candidat a trouvé un emploi, comment fermer son dossier', 'cloturer-un-dossier'],
    ['corriger le téléphone d’un candidat', 'corriger-une-fiche'],
    ['changer le référent d’un candidat', 'referent-du-candidat'],
    ['prendre en charge un candidat', 'referent-du-candidat'],
    ['valider le cv anonyme', 'valider-le-cv-anonyme'],
    ['imprimer la fiche', 'imprimer-la-fiche'],
    ['où sont les nouvelles demandes urgentes', 'urgences'],
    ['retrouver une réunion passée', 'registre-des-reunions'],
    ['qui est connecté', 'qui-est-connecte'],
    ['où sont les offres d’emploi', 'offres-en-cours'],
    ['chercher une offre par département', 'france-travail'],
    ['les offres de france travail', 'france-travail'],
    ['voir les offres', 'offres-en-cours'],
    ['comment ajouter une offre', 'ecrans-des-offres'],
    ['où sont les offres internes', 'ecrans-des-offres'],
    ['liste des entreprises', 'entreprises'],
    ['proposer une offre à un candidat', 'proposer-une-offre'],
    ['quelles offres ont été proposées à ce candidat', 'offres-proposees'],
    ['mise en relation', 'relation'],
    ['combien de candidats en attente', 'chiffres-de-l-accueil'],
    ['où est le tableau de bord', 'tableau-de-bord'],
    ['faire le bilan de l’exercice', 'bilan'],
    ['envoyer un message à un candidat', 'messagerie'],
    ['où sont les correspondants', 'correspondants'],
    ['supprimer un dossier', 'supprimer-un-dossier'],
    ['j’ai créé un dossier par erreur', 'supprimer-un-dossier'],
    ['supprimer une réunion', 'retirer-une-reunion'],
    ['j’ai retiré une réunion par erreur', 'rendre-une-reunion'],
    ['effacer définitivement une réunion', 'effacer-une-reunion'],
    ['retirer une note du suivi', 'retirer-une-note'],
    ['j’ai écrit une note par erreur', 'retirer-une-note'],
    ['j’ai retiré une note par erreur', 'rendre-une-note'],
    ['supprimer une affiche', 'effacer-un-pdf'],
    ['effacer un compte rendu', 'effacer-un-pdf'],
    ['quelle est la date de la prochaine réunion', 'prochaine-reunion'],
    ['la prochaine réunion tombe un jour férié', 'prochaine-reunion'],
  ])('« %s » mène à %s', (question, attendu) => {
    expect(premier(question)).toBe(attendu);
  });

  it('ne trouve rien pour une question vide ou sans rapport', () => {
    expect(chercherDesParcours('', duReferent)).toEqual([]);
    expect(chercherDesParcours('comment faire ?', duReferent)).toEqual([]);
    expect(chercherDesParcours('recette de la tarte tatin', duReferent)).toEqual([]);
  });

  it.each([
    ['modifier les titres du collège', 'parametres-college'],
    ['changer les dates de l’exercice', 'parametres-exercice'],
    ['changer le logo de l’affiche', 'parametres-mise-en-page'],
    ['inviter un nouveau référent', 'invitations'],
    ['ajouter une loge', 'gerer-les-loges'],
    ['ajouter un secteur d’activité', 'secteurs-d-activite'],
    ['changer les types de document', 'types-de-document'],
    ['retirer un référent', 'retirer-un-referent'],
    ['un référent quitte la loge', 'retirer-un-referent'],
    ['retirer un titre du collège', 'retirer-un-titre'],
    ['retirer la photo d’un référent', 'retirer-la-photo-d-un-referent'],
    ['inviter un référent depuis l’annuaire', 'inviter-depuis-l-annuaire'],
    ['corriger l’adresse d’une invitation', 'corriger-une-invitation'],
    ['renvoyer le lien d’une invitation', 'renvoyer-une-invitation'],
    ['il n’a pas reçu le courriel d’invitation', 'renvoyer-une-invitation'],
    ['supprimer une invitation', 'supprimer-une-invitation'],
    ['changer le rôle d’un compte', 'comptes'],
    ['nommer un référent administrateur', 'comptes'],
    ['effacer le compte d’une personne', 'effacer-un-compte'],
    ['voir les connexions des référents', 'connexions'],
    ['quand s’est-il connecté pour la dernière fois', 'connexions'],
    ['ajouter une province', 'gerer-les-provinces'],
    ['le lien du secrétaire d’une loge de Guyenne et Gascogne', 'loges-de-guyenne-et-gascogne'],
  ])('pour l’administration, « %s » mène à %s', (question, attendu) => {
    expect(chercherDesParcours(question, parcoursDuRole('admin'))[0]?.id).toBe(attendu);
  });

  it('ne répond pas à un référent par un parcours d’administration', () => {
    const ids = chercherDesParcours('paramètres et invitations', duReferent).map((p) => p.id);
    expect(ids).not.toContain('parametres');
    expect(ids).not.toContain('invitations');
  });
});

describe('la place du personnage', () => {
  const mesures = {
    ecran: { l: 1200, h: 800 },
    guide: { l: 270, h: 260 },
    personnage: { l: 120, h: 140 },
  };

  it('se met à droite d’une entrée du menu, et tend le bras vers la gauche', () => {
    const place = placer({ x: 0, y: 200, l: 216, h: 32 }, mesures);
    expect(place.cote).toBe('droite');
    expect(place.x).toBeGreaterThanOrEqual(216);
    expect(place.direction.x).toBeLessThan(0);
  });

  it('passe à gauche d’un élément collé au bord droit', () => {
    const place = placer({ x: 1100, y: 10, l: 80, h: 30 }, mesures);
    expect(place.cote).toBe('gauche');
    expect(place.x + mesures.guide.l).toBeLessThanOrEqual(1100);
    expect(place.direction.x).toBeGreaterThan(0);
  });

  it('se met sous un élément qui prend toute la largeur', () => {
    const place = placer({ x: 10, y: 100, l: 1180, h: 40 }, mesures);
    expect(place.cote).toBe('dessous');
    expect(place.y).toBeGreaterThanOrEqual(140);
    expect(place.direction.y).toBeLessThan(0);
  });

  it('monte au-dessus quand il n’y a de place nulle part ailleurs', () => {
    const place = placer({ x: 10, y: 700, l: 1180, h: 60 }, mesures);
    expect(place.cote).toBe('dessus');
    expect(place.depuisLeBas).toBe(true);
    expect(place.direction.y).toBeGreaterThan(0);
  });

  it('se cale en haut de l’écran quand un élément haut ne laisse de place nulle part', () => {
    // Un téléphone, et la case d'accord d'un formulaire : 256 px de haut.
    const telephone = { ...mesures, ecran: { l: 390, h: 664 }, guide: { l: 270, h: 340 } };
    const place = placer({ x: 30, y: 290, l: 330, h: 256 }, telephone);
    expect(place.cote).toBe('dessus');
    expect(place.depuisLeBas).toBe(false);
    expect(place.y).toBe(8);
    expect(place.x).toBeGreaterThanOrEqual(8);
    expect(place.x + telephone.guide.l).toBeLessThanOrEqual(390 - 8);
  });

  it('se cale en bas quand c’est sous l’élément qu’il reste le plus de place', () => {
    // Un téléphone, et la liste des candidats : haute, avec du vide dessous.
    // Calé en haut, le guide masquait le titre et le bouton « Menu ».
    const telephone = { ...mesures, ecran: { l: 390, h: 760 }, guide: { l: 270, h: 290 } };
    const place = placer({ x: 0, y: 240, l: 390, h: 225 }, telephone);
    expect(place.cote).toBe('dessous');
    expect(place.depuisLeBas).toBe(false);
    expect(place.y + telephone.guide.h).toBeLessThanOrEqual(760 - 8);
    // Il ne remonte pas plus haut qu'il ne faut : le haut de la page reste libre.
    expect(place.y).toBeGreaterThanOrEqual(240);
    expect(place.direction.y).toBeLessThan(0);
  });

  it('se pose juste sous une entrée du menu quand sa hauteur réelle le permet', () => {
    // « Référents », dans le menu déployé d'un téléphone. Avec les 340 px
    // d'estimation il ne tenait pas dessous et partait en haut de l'écran.
    const telephone = { ...mesures, ecran: { l: 390, h: 760 }, guide: { l: 270, h: 270 } };
    const place = placer({ x: 6, y: 355, l: 378, h: 55 }, telephone);
    expect(place.cote).toBe('dessous');
    expect(place.y).toBe(355 + 55 + 14);
  });

  it('se tient au-dessus de la barre d’onglets, et sur un onglet quand il le désigne', () => {
    const telephone = {
      ...mesures,
      ecran: { l: 390, h: 780 },
      guide: { l: 270, h: 290 },
      reserveEnBas: 56,
    };
    // Une liste haute : calé en bas, il s'arrête au-dessus de la barre.
    const sousLaListe = placer({ x: 0, y: 240, l: 390, h: 225 }, telephone);
    expect(sousLaListe.y + telephone.guide.h).toBeLessThanOrEqual(780 - 56 - 8);
    // L'onglet « Candidats », dans la barre : le guide s'accroche par le bas,
    // ses pieds juste au-dessus de l'onglet — compté depuis le vrai bas de l'écran.
    const surLOnglet = placer({ x: 98, y: 724, l: 97, h: 56 }, telephone);
    expect(surLOnglet.cote).toBe('dessus');
    expect(surLOnglet.depuisLeBas).toBe(true);
    expect(780 - surLOnglet.y).toBeLessThanOrEqual(724);
  });

  it('ne sort jamais de l’écran, même sur un petit', () => {
    const petit = { ...mesures, ecran: { l: 320, h: 480 } };
    const place = placer({ x: 20, y: 20, l: 280, h: 40 }, petit);
    expect(place.x).toBeGreaterThanOrEqual(8);
    expect(place.x + petit.guide.l).toBeLessThanOrEqual(320 - 8);
  });
});

describe('Claude en renfort de l’aide', () => {
  const duReferent = parcoursDuRole('referent');

  it('n’accepte qu’une question de taille raisonnable', () => {
    expect(QuestionDAide.safeParse({ question: '  comment exporter ?  ' }).success).toBe(true);
    expect(QuestionDAide.safeParse({ question: 'a' }).success).toBe(false);
    expect(QuestionDAide.safeParse({ question: 'x'.repeat(301) }).success).toBe(false);
    expect(QuestionDAide.safeParse({}).success).toBe(false);
    expect(QuestionDAide.safeParse(null).success).toBe(false);
  });

  it('ne montre à Claude que le catalogue du rôle, sans les étapes', () => {
    const montre = catalogueDuRenfort(duReferent);
    expect(montre).toContain('"mes-candidats"');
    expect(montre).not.toContain('"parametres"');
    expect(montre).not.toContain('data-aide');
    expect(montre).not.toContain('etapes');
  });

  it('enferme la question dans sa balise', () => {
    const demande = demandeDeRenfort('où sont mes dossiers', duReferent);
    expect(demande).toContain('<question>\noù sont mes dossiers\n</question>');
  });

  it('écarte les identifiants inventés, les doublons et ceux d’un autre rôle', () => {
    expect(
      retenir(['mes-candidats', 'inconnu', 'parametres', 'mes-candidats', 'mon-compte'], duReferent),
    ).toEqual(['mes-candidats', 'mon-compte']);
  });

  it('ne garde pas plus de propositions que prévu', () => {
    const tous = duReferent.map((p) => p.id);
    expect(retenir(tous, duReferent)).toHaveLength(PROPOSITIONS_AU_PLUS);
  });

  it('tient sa limite en base, avec les mêmes nombres que la migration', () => {
    // Le compte ne vit plus en mémoire du serveur : la migration 0082 le
    // tient. Les deux nombres sont écrits des deux côtés — ce test les lie.
    const migration = readFileSync(
      join(__dirname, '..', '..', '..', 'supabase', 'migrations', '0082_limite_des_questions_d_aide.sql'),
      'utf8',
    );
    expect(migration).toContain(`if recentes >= ${QUESTIONS_PAR_FENETRE} then`);
    expect(migration).toContain(`interval '${MINUTES_DE_LA_FENETRE} minutes'`);
    // La table ne garde pas le texte de la question.
    expect(migration).not.toMatch(/\b(question|texte)\s+text\b/);
  });

  it('fait compter par la base, après avoir validé la question, et refuse sans compteur', () => {
    const route = readFileSync(join(SRC, 'app', 'api', 'aide', 'renfort', 'route.ts'), 'utf8');
    expect(route).toContain(".rpc('compter_une_question_d_aide')");
    expect(route).not.toContain('new Map');
    // L'ordre : la forme d'abord, le compteur ensuite, Claude en dernier.
    const forme = route.indexOf('QuestionDAide.safeParse');
    const compteur = route.indexOf("rpc('compter_une_question_d_aide')");
    const claude = route.indexOf('demanderLesParcours(');
    expect(forme).toBeGreaterThan(0);
    expect(compteur).toBeGreaterThan(forme);
    expect(claude).toBeGreaterThan(compteur);
    // Une erreur du compteur arrête tout avant Claude.
    expect(route.slice(compteur, claude)).toMatch(/if \(error\)[\s\S]*503/);
  });
});

describe('la marche du personnage', () => {
  it('ne marche pas pour un déplacement de rien', () => {
    expect(marcheEntre({ x: 100, y: 100 }, { x: 100 + PAS_MINIMAL - 1, y: 100 })).toBeNull();
    expect(marcheEntre({ x: 0, y: 0 }, { x: 0, y: 0 })).toBeNull();
  });

  it('part d’où il était et regarde où il va', () => {
    const pas = marcheEntre({ x: 800, y: 600 }, { x: 200, y: 600 });
    expect(pas).not.toBeNull();
    // Posé à l'arrivée, il est d'abord décalé de 600 px vers la droite.
    expect(pas?.depuis).toEqual({ x: 600, y: -0 });
    expect(pas?.sens.x).toBe(-1);
  });

  it('met plus de temps pour aller plus loin, dans des bornes', () => {
    const court = marcheEntre({ x: 0, y: 0 }, { x: 60, y: 0 });
    const moyen = marcheEntre({ x: 0, y: 0 }, { x: 400, y: 0 });
    const long = marcheEntre({ x: 0, y: 0 }, { x: 3000, y: 2000 });
    expect(court?.duree).toBe(350);
    expect(moyen!.duree).toBeGreaterThan(court!.duree);
    expect(long?.duree).toBe(1300);
  });

  it('donne un sens de longueur un, en diagonale aussi', () => {
    const pas = marcheEntre({ x: 0, y: 0 }, { x: 300, y: 400 });
    expect(Math.hypot(pas!.sens.x, pas!.sens.y)).toBeCloseTo(1);
    expect(pas?.sens.y).toBeGreaterThan(0);
  });
});

describe('l’aide des formulaires publics', () => {
  const candidature = parcoursDuCatalogue('candidature');
  const parrainage = parcoursDuCatalogue('parrainage');

  it('ne cite que des ancres posées sur son propre formulaire', () => {
    const formulaires = {
      candidature: readFileSync(
        join(SRC, 'app', 'candidature', '[jeton]', 'FormulaireCandidature.tsx'),
        'utf8',
      ),
      parrainage: readFileSync(
        join(SRC, 'app', 'parrainage', '[jeton]', 'FormulaireParrain.tsx'),
        'utf8',
      ),
    };
    for (const catalogue of CATALOGUES) {
      for (const parcours of parcoursDuCatalogue(catalogue)) {
        for (const etape of parcours.etapes) {
          expect(formulaires[catalogue], parcours.id).toContain(`data-aide="${etape.ancre}"`);
        }
      }
    }
  });

  it('est montée sur les deux pages, et sans Claude', () => {
    for (const catalogue of CATALOGUES) {
      const page = readFileSync(join(SRC, 'app', catalogue, '[jeton]', 'page.tsx'), 'utf8');
      expect(page).toContain(`<Aide catalogue="${catalogue}" />`);
      expect(page).not.toContain('renfort');
    }
  });

  it('reste sur la page : aucun parcours n’emmène ailleurs', () => {
    for (const catalogue of CATALOGUES) {
      for (const parcours of parcoursDuCatalogue(catalogue)) {
        expect(parcours.destination, parcours.id).toBeNull();
        expect(parcours.etapes, parcours.id).toHaveLength(1);
        expect(parcours.etapes[0].ecran, parcours.id).toBeUndefined();
      }
    }
  });

  it('ne partage aucun identifiant avec l’espace de travail', () => {
    const publics = CATALOGUES.flatMap((c) => parcoursDuCatalogue(c).map((p) => p.id));
    expect(new Set(publics).size).toBe(publics.length);
    const internes = new Set(PARCOURS.map((p) => p.id));
    for (const id of publics) expect(internes.has(id), id).toBe(false);
  });

  it('parle au candidat avec les mots du produit', () => {
    const textes = CATALOGUES.flatMap((c) =>
      parcoursDuCatalogue(c).flatMap((p) => [p.titre, ...p.etapes.map((e) => e.texte)]),
    ).join(' ');
    expect(textes).not.toMatch(/chercheur|demandeur d’emploi|utilisateur/i);
  });

  it.each([
    ['comment joindre mon CV', 'candidature-cv'],
    ['peut-on remplir le formulaire automatiquement', 'candidature-lecture'],
    ['quels champs sont obligatoires', 'candidature-vous'],
    ['je cherche un stage, où le dire', 'candidature-recherche'],
    ['où mettre mon permis', 'candidature-permis'],
    ['où indiquer mes diplômes', 'candidature-parcours'],
    ['ajouter une lettre de motivation', 'candidature-lettre'],
    ['qui verra mes informations', 'candidature-donnees'],
    ['comment envoyer ma fiche', 'candidature-envoyer'],
  ])('le candidat : « %s » mène à %s', (question, attendu) => {
    expect(chercherDesParcours(question, candidature)[0]?.id).toBe(attendu);
  });

  it.each([
    ['que veut dire le degré d’urgence', 'parrainage-commission'],
    ['où mettre l’e-mail du candidat', 'parrainage-candidat'],
    ['qui verra ces informations', 'parrainage-donnees'],
    ['comment envoyer', 'parrainage-envoyer'],
  ])('le parrain : « %s » mène à %s', (question, attendu) => {
    expect(chercherDesParcours(question, parrainage)[0]?.id).toBe(attendu);
  });

  it('propose un exemple que sa propre recherche sait résoudre', () => {
    for (const catalogue of CATALOGUES) {
      expect(chercherDesParcours(EXEMPLES[catalogue], parcoursDuCatalogue(catalogue))).not.toHaveLength(0);
    }
  });
});

describe('les bulles sur téléphone', () => {
  const publics = CATALOGUES.flatMap((c) => [...parcoursDuCatalogue(c)]);

  it('donne à chaque étape d’un formulaire public une version courte', () => {
    for (const parcours of publics) {
      for (const etape of parcours.etapes) {
        expect(etape.court, parcours.id).toBeTruthy();
        expect(etape.court!.length, parcours.id).toBeLessThanOrEqual(100);
        expect(etape.court!.length, parcours.id).toBeLessThan(etape.texte.length);
      }
    }
  });

  it('dit la version courte sur un téléphone, la longue ailleurs', () => {
    const etape = parcoursDuCatalogue('candidature')[0].etapes[0];
    expect(texteDeLEtape(etape, 390)).toBe(etape.court);
    expect(texteDeLEtape(etape, LARGEUR_DE_TELEPHONE)).toBe(etape.texte);
    expect(texteDeLEtape(etape, 1280)).toBe(etape.texte);
  });

  it('garde le texte entier quand il n’y a pas de version courte', () => {
    const etape = PARCOURS.flatMap((p) => p.etapes).find((e) => !e.court)!;
    expect(etape).toBeDefined();
    expect(texteDeLEtape(etape, 390)).toBe(etape.texte);
  });

  it('ne parle ni de colonne ni de fiche « à droite » sur un téléphone', () => {
    // Sur un téléphone la colonne est un menu repliable, et la fiche s'ouvre
    // en plein écran : toute étape dont le texte décrit l'écran large doit
    // avoir sa version pour téléphone, qui ne le décrit plus.
    for (const parcours of PARCOURS) {
      for (const etape of parcours.etapes) {
        const dit = texteDeLEtape(etape, 390);
        expect(dit, parcours.id).not.toMatch(/colonne|à droite, et la liste|fiche à droite/);
      }
    }
  });

  it('ne perd pas en route ce qui protège la personne', () => {
    const court = (id: string) => publics.find((p) => p.id === id)!.etapes[0].court!;
    // La lecture du CV reste annoncée comme facultative et confiée à un tiers.
    expect(court('candidature-lecture')).toMatch(/facultatif/i);
    expect(court('candidature-lecture')).toMatch(/service extérieur/);
    // Qui lit, et le droit de faire supprimer.
    expect(court('candidature-donnees')).toMatch(/commission seule/);
    expect(court('candidature-donnees')).toMatch(/supprimable/);
    expect(court('parrainage-donnees')).toMatch(/jamais publié/);
  });
});

describe('les gestes qui retirent ou effacent', () => {
  const geste = (id: string) => PARCOURS.find((p) => p.id === id)!;
  const derniere = (id: string) => geste(id).etapes[geste(id).etapes.length - 1];

  const DESTRUCTEURS = [
    'supprimer-un-dossier',
    'retirer-un-referent',
    'retirer-une-reunion',
    'rendre-une-reunion',
    'effacer-une-reunion',
  ];

  it('annonce toujours la fenêtre de confirmation', () => {
    for (const id of DESTRUCTEURS) {
      expect(derniere(id).texte, id).toMatch(/confirmation/);
    }
  });

  it('dit ce qui ne se défait pas, et ce qui se défait', () => {
    expect(derniere('supprimer-un-dossier').texte).toMatch(/ne se défait pas/);
    expect(derniere('retirer-un-referent').texte).toMatch(/ne se défait pas/);
    expect(derniere('effacer-une-reunion').texte).toMatch(/rien ne les ramènera/);
    // Retirer une réunion, au contraire, se rattrape : le dire évite la peur
    // de cliquer — et la confusion avec la croix.
    expect(derniere('retirer-une-reunion').texte).toMatch(/rien n’est perdu/);
  });

  it('propose le geste plus doux quand il existe', () => {
    expect(derniere('supprimer-un-dossier').texte).toMatch(/Clôturer/);
    expect(derniere('effacer-une-reunion').texte).toMatch(/corbeille/);
  });

  it('dit à qui le bouton est réservé quand il n’est pas là', () => {
    expect(derniere('supprimer-un-dossier').siAbsent).toMatch(/Vénérable Maître/);
    expect(derniere('effacer-une-reunion').siAbsent).toMatch(/droit d’effacer/);
  });

  it('réserve le retrait d’un référent à l’administration', () => {
    expect(geste('retirer-un-referent').roles).toEqual(['admin']);
    expect(parcoursDuRole('referent').map((p) => p.id)).not.toContain('retirer-un-referent');
  });

  it('ne mène jamais droit à la fenêtre de confirmation', () => {
    // « Emmène-moi » ouvre l'écran, pas la fenêtre : aucune adresse ne porte
    // le paramètre qui la déclenche.
    for (const id of DESTRUCTEURS) {
      expect(geste(id).destination, id).not.toMatch(/supprimer=|retirer=|effacer=|rendre=/);
    }
  });
});

describe('les retraits plus fins', () => {
  const geste = (id: string) => PARCOURS.find((p) => p.id === id)!;
  const derniere = (id: string) => geste(id).etapes[geste(id).etapes.length - 1];

  it('annonce la confirmation avant de retirer une note — et que cela se rattrape', () => {
    const texte = derniere('retirer-une-note').texte;
    expect(texte).toMatch(/fenêtre de confirmation/);
    expect(texte).not.toMatch(/sans fenêtre/);
    expect(texte).toMatch(/sans être effacée/);
    expect(texte).toMatch(/rendre/);
  });

  it('dit vrai : la corbeille d’une note ouvre une fenêtre, elle ne retire plus d’un clic', () => {
    // Le texte de l'aide et l'écran doivent raconter la même chose.
    const ligne = readFileSync(join(SRC, 'components', 'LigneDeSuivi.tsx'), 'utf8');
    expect(ligne).toContain('href={versRetrait}');
    expect(ligne).not.toContain('name="geste" value="retirer"');
    const page = readFileSync(join(SRC, 'app', 'espace', 'candidats', 'page.tsx'), 'utf8');
    expect(page).toContain('FenetreDeRetraitDeNote');
    expect(page).toContain('name="geste" value="retirer"');
  });

  it('annonce aussi la confirmation avant de rendre une note', () => {
    expect(derniere('rendre-une-note').texte).toMatch(/fenêtre de confirmation/);
    // Là encore, l'aide et l'écran racontent la même chose : « Rendre » est
    // un lien vers la fenêtre, et c'est la fenêtre qui poste.
    const fiche = readFileSync(join(SRC, 'app', 'espace', 'candidats', 'PanneauFiche.tsx'), 'utf8');
    expect(fiche).toContain('href={versRetour(note.id)}');
    expect(fiche).not.toContain('name="geste" value="rendre"');
    const page = readFileSync(join(SRC, 'app', 'espace', 'candidats', 'page.tsx'), 'utf8');
    expect(page).toContain('FenetreDeRetourDeNote');
    expect(page).toContain('name="geste" value="rendre"');
  });

  it('dit ce qui ne se défait pas : le PDF effacé', () => {
    const texte = derniere('effacer-un-pdf').texte;
    expect(texte).toMatch(/confirmation/);
    expect(texte).toMatch(/ne se défait pas/);
    expect(texte).toMatch(/toute la loge/);
    expect(derniere('effacer-un-pdf').siAbsent).toMatch(/Vénérable Maître/);
  });

  it('dit ce que garde une fiche quand son titre est retiré', () => {
    const texte = derniere('retirer-un-titre').texte;
    expect(texte).toMatch(/confirmation/);
    expect(texte).toMatch(/rien n’est effacé sur une fiche/);
  });

  it('réserve le retrait d’un titre à l’administration', () => {
    expect(geste('retirer-un-titre').roles).toEqual(['admin']);
    expect(parcoursDuRole('referent').map((p) => p.id)).not.toContain('retirer-un-titre');
  });

  it('n’emmène jamais droit à une fenêtre de confirmation', () => {
    for (const id of ['retirer-une-note', 'rendre-une-note', 'effacer-un-pdf', 'retirer-un-titre']) {
      expect(geste(id).destination, id).not.toMatch(/supprimer=|retirer=|effacer=|rendre=/);
    }
  });
});

describe('l’aide pour retirer une photo', () => {
  const compte = parcoursDuCatalogue('compte');
  const etape = (id: string) => compte.find((p) => p.id === id)!.etapes[0];

  it('est montée sur « Mon compte », avec son propre catalogue et sans Claude', () => {
    const page = readFileSync(join(SRC, 'app', 'mon-compte', 'page.tsx'), 'utf8');
    expect(page).toContain('<Aide catalogue="compte" />');
    expect(page).not.toContain('renfort');
  });

  it('ne cite, sur « Mon compte », que des ancres posées sur cette page', () => {
    const sources = [
      readFileSync(join(SRC, 'app', 'mon-compte', 'FormulaireProfil.tsx'), 'utf8'),
      readFileSync(join(SRC, 'components', 'PortraitDeposable.tsx'), 'utf8'),
    ].join('\n');
    for (const parcours of compte) {
      expect(parcours.destination, parcours.id).toBeNull();
      for (const e of parcours.etapes) {
        expect(sources, parcours.id).toContain(`data-aide="${e.ancre}"`);
        expect(e.court, parcours.id).toBeTruthy();
        expect(e.court!.length, parcours.id).toBeLessThanOrEqual(100);
      }
    }
  });

  it('dit que retirer une photo ne se défait pas — et comment en changer sans la perdre', () => {
    for (const texte of [
      etape('compte-retirer-photo').texte,
      PARCOURS.find((p) => p.id === 'retirer-la-photo-d-un-referent')!.etapes[2].texte,
    ]) {
      expect(texte).toMatch(/fenêtre de confirmation/);
      expect(texte).toMatch(/rien ne défait ce geste/);
      expect(texte).toMatch(/déposez-en simplement une autre/);
    }
    expect(etape('compte-retirer-photo').court).toMatch(/Rien ne défait/);
  });

  it('dit pourquoi le bouton manque quand il n’y a pas de photo', () => {
    expect(etape('compte-retirer-photo').siAbsent).toMatch(/pas de photo/);
    expect(etape('compte-photo').siAbsent).toMatch(/aucune fiche de référent/);
  });

  it.each([
    ['comment changer ma photo', 'compte-photo'],
    ['retirer ma photo', 'compte-retirer-photo'],
    ['changer mon numéro de téléphone', 'compte-profil'],
  ])('sur « Mon compte », « %s » mène à %s', (question, attendu) => {
    expect(chercherDesParcours(question, compte)[0]?.id).toBe(attendu);
  });

  it('réserve la photo d’un autre à l’administration', () => {
    const geste = PARCOURS.find((p) => p.id === 'retirer-la-photo-d-un-referent')!;
    expect(geste.roles).toEqual(['admin']);
    expect(parcoursDuRole('referent').map((p) => p.id)).not.toContain(geste.id);
    expect(parcoursDuRole('referent').map((p) => p.id)).toContain('retirer-ma-photo');
  });

  it('ne promet plus de changer le mot de passe dans « Mon compte »', () => {
    // La page n'a pas de champ pour cela : le mot de passe passe par le
    // courriel de réinitialisation.
    const formulaire = readFileSync(join(SRC, 'app', 'mon-compte', 'FormulaireProfil.tsx'), 'utf8');
    expect(formulaire).not.toMatch(/password/i);
    expect(PARCOURS.find((p) => p.id === 'mon-compte')!.titre).not.toMatch(/mot de passe/);
    expect(PARCOURS.find((p) => p.id === 'mot-de-passe')!.etapes[0].texte).toMatch(/Mot de passe oublié/);
  });

  it('et l’écran des paramètres non plus', () => {
    // Le pied des paramètres décrit « Mon compte » : il doit en dire ce qui
    // s'y trouve, comme l'aide. Le texte vit dans son composant, que le layout
    // et la rubrique des loges de Guyenne et Gascogne reprennent.
    const pied = readFileSync(join(SRC, 'app', 'espace', 'parametres', 'RenvoiMonCompte.tsx'), 'utf8');
    const phrase = pied.slice(pied.indexOf('<Link href="/mon-compte">'));
    expect(phrase).not.toMatch(/mot de\s+passe/);
    expect(phrase).not.toMatch(/votre adresse/);
    expect(phrase).toMatch(/votre nom, votre téléphone, votre\s+photo/);
  });
});

describe('les écrans des offres, pas encore livrés', () => {
  const A_VENIR = ['ecrans-des-offres', 'entreprises', 'relation', 'proposer-une-offre', 'offres-proposees'];
  const derniere = (id: string) => {
    const p = PARCOURS.find((x) => x.id === id)!;
    return p.etapes[p.etapes.length - 1];
  };

  it('dit franchement que ce n’est pas encore en service', () => {
    for (const id of A_VENIR) {
      expect(derniere(id).texte, id).toMatch(/pas encore en service/);
      expect(derniere(id).ancre, id).toMatch(/^(eteint:|onglet-eteint:|proposer-offre$)/);
    }
  });

  it('ne promet ni date ni lot', () => {
    // L'aide parle à des référents : « lot 4 » ne leur dit rien, et une date
    // écrite ici deviendrait fausse sans que personne ne la relise.
    for (const id of A_VENIR) {
      expect(derniere(id).texte, id).not.toMatch(/lot \d|bientôt|prochainement|\b20\d\d\b/i);
    }
  });

  it('montre ce qui existe déjà : les offres en cours, sur l’accueil', () => {
    const p = PARCOURS.find((x) => x.id === 'offres-en-cours')!;
    expect(p.destination).toBe('/espace/accueil');
    expect(derniere('offres-en-cours').ancre).toBe('offres-en-cours');
    expect(derniere('ecrans-des-offres').texte).toMatch(/l’accueil liste les offres en cours/);
  });

  it('n’emmène nulle part quand il n’y a pas d’écran', () => {
    for (const id of ['ecrans-des-offres', 'entreprises', 'relation']) {
      expect(PARCOURS.find((x) => x.id === id)!.destination, id).toBeNull();
    }
  });
});

describe('les écrans de la loge et du pilotage, pas encore livrés', () => {
  const A_VENIR = [
    'tableau-de-bord',
    'bilan',
    'messagerie',
    'correspondants',
    'gerer-les-loges',
    'types-de-document',
  ];
  const parcours = (id: string) => PARCOURS.find((x) => x.id === id)!;
  const derniere = (id: string) => parcours(id).etapes[parcours(id).etapes.length - 1];

  it('dit franchement que ce n’est pas encore en service, sans date ni lot', () => {
    for (const id of A_VENIR) {
      expect(derniere(id).texte, id).toMatch(/pas encore en service/);
      expect(derniere(id).ancre, id).toMatch(/^(eteint:|rubrique-eteinte:)/);
      expect(derniere(id).texte, id).not.toMatch(/lot \d|bientôt|prochainement|\b20\d\d\b/i);
    }
  });

  it('ne désigne à un rôle que des entrées grisées qu’il voit', () => {
    for (const role of ['referent', 'admin'] as const) {
      const visibles = famillesDuRole(role).flatMap((f) => f.entrees.map((e) => e.libelle));
      for (const p of parcoursDuRole(role)) {
        for (const etape of p.etapes) {
          if (!etape.ancre?.startsWith('eteint:')) continue;
          expect(visibles, `${role} · ${p.id}`).toContain(etape.ancre.slice(7));
        }
      }
    }
  });

  it('réserve à l’administration ce qui est dans sa famille ou ses paramètres', () => {
    const duReferent = parcoursDuRole('referent').map((p) => p.id);
    for (const id of ['gerer-les-loges', 'secteurs-d-activite', 'types-de-document']) {
      expect(parcours(id).roles, id).toEqual(['admin']);
      expect(duReferent, id).not.toContain(id);
    }
  });

  it('montre ce qui existe déjà : les chiffres de l’accueil', () => {
    expect(parcours('chiffres-de-l-accueil').destination).toBe('/espace/accueil');
    expect(derniere('chiffres-de-l-accueil').ancre).toBe('compteurs');
    expect(derniere('tableau-de-bord').texte).toMatch(/en tête de l’accueil/);
  });

  it('décrit les archives comme l’écran les décrit', () => {
    // Le texte d'origine parlait de dossiers et de réunions : la rubrique ne
    // garde que les documents de la commission.
    const texte = derniere('parametres-archives').texte;
    expect(texte).toMatch(/comptes rendus, affiches et affichettes/);
    expect(texte).not.toMatch(/dossiers|réunions/);
  });
});

describe('ce que l’aide et le menu se disent', () => {
  it('reconnaît une ancre du menu, allumée ou éteinte, et rien d’autre', async () => {
    const { ancreDuMenu } = await import('../src/lib/aide/signaux');
    expect(ancreDuMenu('menu:/espace/candidats')).toBe(true);
    expect(ancreDuMenu('eteint:Relation')).toBe(true);
    expect(ancreDuMenu('liste-candidats')).toBe(false);
    expect(ancreDuMenu(null)).toBe(false);
  });

  it('n’envoie plus « dans le menu » sur un téléphone : le bouton s’appelle « Plus »', () => {
    // « Menu » reste un mot permis — une liste déroulante en est un, et les
    // paramètres ont le leur. Ce qui ne doit plus se dire, c'est le menu de
    // navigation, qui n'a plus ce nom.
    for (const parcours of PARCOURS) {
      for (const etape of parcours.etapes) {
        expect(texteDeLEtape(etape, 390), parcours.id).not.toMatch(
          /(dans le|en haut du|en bas du) menu\b(?! des paramètres)/i,
        );
      }
    }
  });

  it('ne montre « Paramètres » qu’à l’administration', () => {
    const colonne = readFileSync(join(SRC, 'components', 'Colonne.tsx'), 'utf8');
    expect(colonne).toMatch(/profil\.role === 'admin' && \(\s*<Link\s+href=\{PARAMETRES\.vers\}/);
  });

  it('ne range dans la barre d’onglets que des entrées que la colonne offre', async () => {
    const { ANCRES_DES_ONGLETS } = await import('../src/lib/aide/signaux');
    const { FAMILLES } = await import('../src/lib/navigation');
    const offertes = FAMILLES.flatMap((f) => f.entrees).map((e) => `menu:${e.vers}`);
    for (const ancre of ANCRES_DES_ONGLETS) expect(offertes).toContain(ancre);
  });
});

describe('le compte rendu, l’affiche et l’affichette', () => {
  const parcours = (id: string) => PARCOURS.find((p) => p.id === id)!;
  const ancres = (id: string) => parcours(id).etapes.map((e) => e.ancre);
  const etape = (id: string, ancre: string) => parcours(id).etapes.find((e) => e.ancre === ancre)!;
  const DOCUMENTS = ['documents-de-la-reunion', 'creer-le-compte-rendu', 'creer-l-affiche', 'creer-l-affichette'];

  it('part de « Réunion », ouvre l’appel, et finit où l’exemplaire est rangé', () => {
    for (const id of DOCUMENTS) {
      const a = ancres(id);
      expect(a[0], id).toBe('menu:/espace/reunion');
      expect(a[1], id).toBe('bouton-ouvrir-appel');
      expect(a[a.length - 1], id).toBe('menu:/espace/documents');
      expect(parcours(id).destination, id).toBe('/espace/reunion');
      // « Emmène-moi » reprend sur « Ouvrir l'appel » : la feuille n'est pas
      // encore ouverte à l'arrivée.
      expect(etapeDArrivee(parcours(id)), id).toBe(1);
    }
  });

  it('désigne le bon bouton pour chaque document', () => {
    expect(ancres('creer-le-compte-rendu')).toContain('bouton-compte-rendu');
    expect(ancres('creer-l-affiche')).toContain('bouton-affiche');
    expect(ancres('creer-l-affichette')).toContain('bouton-affichette');
    // Le compte rendu imprime les présences et la prochaine réunion.
    expect(ancres('creer-le-compte-rendu')).toEqual(
      expect.arrayContaining(['compte-de-l-appel', 'prochaine-reunion']),
    );
    // L'affichette attend son dossier.
    const affichette = ancres('creer-l-affichette');
    expect(affichette.indexOf('choix-affichette')).toBeLessThan(affichette.indexOf('bouton-affichette'));
    // Le pas à pas complet suit l'ordre d'une séance.
    expect(ancres('documents-de-la-reunion')).toEqual([
      'menu:/espace/reunion',
      'bouton-ouvrir-appel',
      'compte-de-l-appel',
      'choix-affichette',
      'prochaine-reunion',
      'documents-reunion',
      'menu:/espace/documents',
    ]);
  });

  it('dit ce qui circule et ce qui reste à la commission', () => {
    expect(etape('creer-le-compte-rendu', 'bouton-compte-rendu').texte).toMatch(/reste à la commission/);
    expect(etape('creer-l-affiche', 'bouton-affiche').texte).toMatch(/sans aucun nom/);
    expect(etape('creer-l-affichette', 'bouton-affichette').texte).toMatch(/sans nom/);
    expect(etape('creer-l-affichette', 'bouton-affichette').texte).toMatch(/Grisé/);
  });

  it('dit comment ouvrir la feuille quand ce qu’il désigne n’y est pas', () => {
    const SUR_LA_FEUILLE = [
      'compte-de-l-appel',
      'choix-affichette',
      'prochaine-reunion',
      'documents-reunion',
      'bouton-compte-rendu',
      'bouton-affiche',
      'bouton-affichette',
      'fermer-la-feuille',
    ];
    for (const id of [...DOCUMENTS, 'faire-l-appel']) {
      for (const e of parcours(id).etapes) {
        if (!e.ancre || !SUR_LA_FEUILLE.includes(e.ancre)) continue;
        expect(e.siAbsent, `${id} → ${e.ancre}`).toMatch(/ouvrez d’abord l’appel/);
        expect(e.ecran, `${id} → ${e.ancre}`).toBe('/espace/reunion');
      }
    }
  });

  it('suit le bouton « Affichette », allumé comme grisé', () => {
    // Grisé tant qu'aucun dossier n'est choisi : l'aide doit le trouver aussi.
    const page = readFileSync(join(SRC, 'app', 'espace', 'reunion', 'page.tsx'), 'utf8');
    expect(page.match(/data-aide="bouton-affichette"/g)).toHaveLength(2);
  });

  it('dit, au téléphone, où est l’onglet des documents, sans parler de colonne', () => {
    for (const id of DOCUMENTS) {
      const derniere = parcours(id).etapes[parcours(id).etapes.length - 1];
      expect(texteDeLEtape(derniere, 390), id).toMatch(/onglet « Documents »/);
      expect(texteDeLEtape(derniere, 1280), id).toMatch(/l’accueil le montre aussi/);
    }
  });

  it('ne dit pas qu’une affichette redemandée un autre jour remplace la précédente', () => {
    // Son nom porte le jour où on la tire : le lendemain, c'est un second exemplaire.
    const derniere = parcours('creer-l-affichette').etapes.at(-1)!;
    expect(derniere.texte).toMatch(/le même jour/);
    expect(derniere.texte).toMatch(/n’est pas rangée/);
  });
});

describe('les gestes d’administration livrés depuis le 11 novembre', () => {
  const parcours = (id: string) => PARCOURS.find((p) => p.id === id)!;
  const derniere = (id: string) => parcours(id).etapes[parcours(id).etapes.length - 1];
  const ADMINISTRATION = [
    'inviter-depuis-l-annuaire',
    'corriger-une-invitation',
    'renvoyer-une-invitation',
    'supprimer-une-invitation',
    'comptes',
    'effacer-un-compte',
    'connexions',
    'gerer-les-provinces',
    'loges-de-guyenne-et-gascogne',
  ];

  it('les réserve à l’administration', () => {
    const duReferent = parcoursDuRole('referent').map((p) => p.id);
    for (const id of ADMINISTRATION) {
      expect(parcours(id).roles, id).toEqual(['admin']);
      expect(duReferent, id).not.toContain(id);
    }
  });

  it('annonce la confirmation, et ce qui ne se défait pas', () => {
    for (const id of ['effacer-un-compte', 'supprimer-une-invitation']) {
      expect(derniere(id).texte, id).toMatch(/fenêtre de confirmation/);
      expect(derniere(id).texte, id).toMatch(/ne se défait pas/);
      expect(derniere(id).court, id).toMatch(/Ne se défait pas/);
      expect(parcours(id).destination, id).not.toMatch(/supprimer=|effacer=/);
    }
    // Ce qui reste : la fiche de référent, le compte ouvert.
    expect(derniere('effacer-un-compte').texte).toMatch(/fiche de référent reste/);
    expect(derniere('effacer-un-compte').texte).toMatch(/nouvelle invitation/);
    expect(derniere('supprimer-une-invitation').texte).toMatch(/laisse le compte intact/);
  });

  it('dit que renvoyer un lien se fait sans confirmation, et rend l’ancien caduc', () => {
    expect(derniere('renvoyer-une-invitation').texte).toMatch(/Pas de fenêtre de confirmation/);
    expect(derniere('renvoyer-une-invitation').texte).toMatch(/l’ancien ne vaut plus/);
  });

  it('écrit « Loges de Guyenne et Gascogne » à l’écran, jamais « loges du réseau »', () => {
    const p = parcours('loges-de-guyenne-et-gascogne');
    for (const texte of [p.titre, ...p.etapes.map((e) => e.texte)]) {
      expect(texte).not.toMatch(/loges? du réseau/i);
    }
    expect(p.destination).toBe('/espace/parametres/loges-du-reseau');
  });
});

describe('la visite qui survit au rechargement de la page', () => {
  const tous = parcoursDuRole('referent');
  const compteRendu = tous.find((p) => p.id === 'creer-le-compte-rendu')!;
  const maintenant = 1_800_000_000_000;

  it('reprend le même parcours, à la même étape', () => {
    const texte = retenirLaVisite('espace', { parcours: compteRendu, index: 2 }, maintenant);
    expect(reprendreLaVisite(texte, 'espace', tous, maintenant + 2000)).toEqual({
      parcours: compteRendu,
      index: 2,
    });
  });

  it('ne retient rien d’autre que le parcours, l’étape et le moment', () => {
    const texte = retenirLaVisite('espace', { parcours: compteRendu, index: 2 }, maintenant)!;
    expect(Object.keys(JSON.parse(texte)).sort()).toEqual(['id', 'index', 'le', 'lieu']);
    expect(retenirLaVisite('espace', null, maintenant)).toBeNull();
  });

  it('ne reprend pas ailleurs, ni trop tard, ni un parcours que le rôle n’a pas', () => {
    const texte = retenirLaVisite('espace', { parcours: compteRendu, index: 2 }, maintenant);
    expect(reprendreLaVisite(texte, 'compte', tous, maintenant)).toBeNull();
    expect(reprendreLaVisite(texte, 'espace', tous, maintenant + REPRISE_AU_PLUS_TARD_MS + 1)).toBeNull();
    const comptes = parcoursDuRole('admin').find((p) => p.id === 'comptes')!;
    const dAdministration = retenirLaVisite('espace', { parcours: comptes, index: 0 }, maintenant);
    expect(reprendreLaVisite(dAdministration, 'espace', tous, maintenant)).toBeNull();
  });

  it('ignore ce qui est abîmé ou hors bornes', () => {
    for (const texte of [
      null,
      '',
      'pas du json',
      'null',
      '42',
      JSON.stringify({ lieu: 'espace', id: 'creer-le-compte-rendu', index: 99, le: maintenant }),
      JSON.stringify({ lieu: 'espace', id: 'creer-le-compte-rendu', index: -1, le: maintenant }),
      JSON.stringify({ lieu: 'espace', id: 'creer-le-compte-rendu', index: 1.5, le: maintenant }),
      JSON.stringify({ lieu: 'espace', id: 'inconnu', index: 0, le: maintenant }),
      JSON.stringify({ lieu: 'espace', id: 'creer-le-compte-rendu', index: 0 }),
    ]) {
      expect(reprendreLaVisite(texte, 'espace', tous, maintenant), String(texte)).toBeNull();
    }
  });

  it('passe à l’étape suivante, et finit après la dernière', () => {
    const derniere = compteRendu.etapes.length - 1;
    expect(etapeSuivante({ parcours: compteRendu, index: 0 }, 0)).toEqual({ parcours: compteRendu, index: 1 });
    expect(etapeSuivante({ parcours: compteRendu, index: derniere }, derniere)).toBeNull();
    // Un clic en retard sur une étape déjà quittée ne fait rien.
    const visite = { parcours: compteRendu, index: 3 };
    expect(etapeSuivante(visite, 1)).toBe(visite);
  });

  it('est branchée sur l’aide : relue au montage, écrite avant que le clic ne recharge', () => {
    const aide = readFileSync(join(SRC, 'components', 'aide', 'Aide.tsx'), 'utf8');
    expect(aide).toContain('reprendreLaVisite(lireLaVisite(), lieu, tous, Date.now())');
    // Dans le gestionnaire du clic, l'écriture précède le passage à l'étape.
    const clic = aide.slice(aide.indexOf('const clic = (e: MouseEvent)'));
    expect(clic.indexOf('ecrireLaVisite(')).toBeGreaterThan(0);
    expect(clic.indexOf('ecrireLaVisite(')).toBeLessThan(clic.indexOf('avancer(index)'));
  });
});
