import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PARCOURS, cheminDe, etapeDArrivee, parcoursDuRole } from '../src/lib/aide/parcours';
import { placer } from '../src/lib/aide/placement';
import { chercherDesParcours, motsUtiles, normaliser } from '../src/lib/aide/recherche';
import { PARAMETRES, famillesDuRole } from '../src/lib/navigation';
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
  const entrees = famillesDuRole(role).flatMap((f) => f.entrees.map((e) => e.vers));
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
    ['rouvrir un dossier clôturé', 'dossiers-clotures'],
    ['faire l’appel de la réunion', 'faire-l-appel'],
    ['imprimer le compte rendu', 'documents-de-la-reunion'],
    ['comment sortir l’affichette', 'documents-de-la-reunion'],
    ['changer mon mot de passe', 'mon-compte'],
    ['comment me déconnecter', 'se-deconnecter'],
    ['trouver un référent', 'annuaire-des-referents'],
  ])('« %s » mène à %s', (question, attendu) => {
    expect(premier(question)).toBe(attendu);
  });

  it('ne trouve rien pour une question vide ou sans rapport', () => {
    expect(chercherDesParcours('', duReferent)).toEqual([]);
    expect(chercherDesParcours('comment faire ?', duReferent)).toEqual([]);
    expect(chercherDesParcours('recette de la tarte tatin', duReferent)).toEqual([]);
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

  it('ne sort jamais de l’écran, même sur un petit', () => {
    const petit = { ...mesures, ecran: { l: 320, h: 480 } };
    const place = placer({ x: 20, y: 20, l: 280, h: 40 }, petit);
    expect(place.x).toBeGreaterThanOrEqual(8);
    expect(place.x + petit.guide.l).toBeLessThanOrEqual(320 - 8);
  });
});
