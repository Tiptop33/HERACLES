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
  FENETRE_DES_QUESTIONS,
  PROPOSITIONS_AU_PLUS,
  QUESTIONS_PAR_FENETRE,
  QuestionDAide,
  catalogueDuRenfort,
  demandeDeRenfort,
  questionAutorisee,
  retenir,
} from '../src/lib/aide/renfort';
import { PARAMETRES, famillesDuRole } from '../src/lib/navigation';
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
    ['imprimer le compte rendu', 'documents-de-la-reunion'],
    ['comment sortir l’affichette de la réunion', 'documents-de-la-reunion'],
    ['l’affichette d’un candidat', 'imprimer-la-fiche'],
    ['changer mon mot de passe', 'mon-compte'],
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
    ['supprimer un dossier', 'supprimer-un-dossier'],
    ['j’ai créé un dossier par erreur', 'supprimer-un-dossier'],
    ['supprimer une réunion', 'retirer-une-reunion'],
    ['j’ai retiré une réunion par erreur', 'rendre-une-reunion'],
    ['effacer définitivement une réunion', 'effacer-une-reunion'],
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
    ['retirer un référent', 'retirer-un-referent'],
    ['un référent quitte la loge', 'retirer-un-referent'],
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

  it('limite les questions par personne, puis rouvre après la fenêtre', () => {
    const passages = new Map<string, number[]>();
    const t0 = 1_000_000;
    for (let i = 0; i < QUESTIONS_PAR_FENETRE; i += 1) {
      expect(questionAutorisee(passages, 'moi', t0 + i)).toBe(true);
    }
    expect(questionAutorisee(passages, 'moi', t0 + 100)).toBe(false);
    // Une autre personne n'est pas concernée.
    expect(questionAutorisee(passages, 'elle', t0 + 100)).toBe(true);
    expect(questionAutorisee(passages, 'moi', t0 + FENETRE_DES_QUESTIONS + 100)).toBe(true);
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
    const etape = PARCOURS[0].etapes[0];
    expect(etape.court).toBeUndefined();
    expect(texteDeLEtape(etape, 390)).toBe(etape.texte);
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
