import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { construireCompteRendu, jour, marque, nomComplet } from '../src/lib/compte-rendu';
import { Feuille, lisible } from '../src/lib/pdf';
import type { LigneCandidatRendu, LignePresence } from '../src/lib/compte-rendu';

/**
 * Le compte rendu part par courriel, et il porte des coordonnées : il doit se
 * produire à tous les coups. Ce qui l'en empêcherait, ce n'est pas une erreur
 * de calcul — c'est un caractère que la police ne sait pas écrire, et qui fait
 * échouer la requête entière. D'où le poids donné ici à `lisible()`.
 */

function presence(reste: Partial<LignePresence> = {}): LignePresence {
  return {
    referent_id: '00000000-0000-0000-0000-000000000001',
    nom: 'DUPONT',
    prenom: 'Marie',
    email: 'marie@example.org',
    telephone: '06 00 00 00 00',
    etat: 'Présent',
    presences: 3,
    taux: 100,
    ...reste,
  };
}

function candidat(reste: Partial<LigneCandidatRendu> = {}): LigneCandidatRendu {
  return {
    candidat_id: '00000000-0000-0000-0000-000000000002',
    numero: 900,
    ouvert_le: '2025-06-18',
    emploi: 'Chef de travaux',
    recherche: 'DIRECTION DE TRAVAUX',
    nom: 'DUVAL',
    prenom: 'Chloé',
    referent_nom: 'OMBRE',
    commentaire: 'contact ce jour',
    ...reste,
  };
}

describe('ce que la police sait écrire', () => {
  it('garde les accents, les guillemets et les signes du français', () => {
    expect(lisible('Réunion « HERACLES » — élève, ça va')).toBe(
      'Réunion « HERACLES » — élève, ça va',
    );
  });

  it('retire ce qu’une police WinAnsi ne saurait pas poser', () => {
    // Le cas qui casserait tout : un émoji collé dans un commentaire de suivi.
    expect(lisible('rendez-vous 👍 pris')).toBe('rendez-vous  pris');
    expect(lisible('中文')).toBe('');
  });

  it('ramène les espaces insécables à des espaces ordinaires', () => {
    // Copiés depuis Word, ils traversent Bubble et arrivent jusqu’ici.
    expect(lisible('06 12 34')).toBe('06 12 34');
  });

  it('accepte le vide sans se plaindre', () => {
    expect(lisible(null)).toBe('');
    expect(lisible(undefined)).toBe('');
  });
});

describe('les colonnes du tableau', () => {
  it('abrège l’état du jour comme le document d’origine', () => {
    expect(marque('Présent')).toBe('P');
    expect(marque('Excusé')).toBe('E');
    expect(marque('Absent')).toBe('A');
  });

  it('laisse vide celui que personne n’a appelé', () => {
    // Vide, et non un tiret : « on ne sait rien » n’est pas « on a regardé ».
    expect(marque(null)).toBe('');
  });

  it('écrit la date à la manière du document', () => {
    expect(jour('2025-06-18')).toBe('18/06/25');
    expect(jour(null)).toBe('');
    expect(jour('')).toBe('');
  });

  it('assemble le nom sans espace en trop quand le prénom manque', () => {
    expect(nomComplet('DUVAL', 'Chloé')).toBe('DUVAL Chloé');
    expect(nomComplet('DUVAL', null)).toBe('DUVAL');
    expect(nomComplet(null, null)).toBe('');
  });
});

describe('la découpe des cellules', () => {
  it('coupe aux mots pour tenir dans la colonne', async () => {
    const feuille = await Feuille.ouvrir();
    const lignes = feuille.couper('un deux trois quatre cinq six sept huit', 60, 8);
    expect(lignes.length).toBeGreaterThan(1);
    expect(lignes.join(' ')).toBe('un deux trois quatre cinq six sept huit');
  });

  it('coupe un mot plus large que la colonne plutôt que de déborder', async () => {
    const feuille = await Feuille.ouvrir();
    const lignes = feuille.couper('anticonstitutionnellement', 30, 8);
    expect(lignes.length).toBeGreaterThan(1);
    expect(lignes.join('')).toBe('anticonstitutionnellement');
  });

  it('rend une ligne vide pour un texte vide, et non rien du tout', async () => {
    const feuille = await Feuille.ouvrir();
    expect(feuille.couper('', 100, 8)).toEqual(['']);
  });
});

describe('le document lui-même', () => {
  it('produit un PDF', async () => {
    const octets = await construireCompteRendu({
      tenueLe: '2026-06-10',
      lieu: 'Temple',
      loge: 'Pau',
      presences: [presence(), presence({ nom: 'MARTIN', etat: 'Excusé', presences: 1, taux: 33 })],
      candidats: [candidat()],
    });
    expect(Buffer.from(octets.slice(0, 5)).toString()).toBe('%PDF-');
    expect(octets.length).toBeGreaterThan(1000);
  });

  it('tient une réunion sans personne et sans dossier', async () => {
    const octets = await construireCompteRendu({
      tenueLe: '2026-06-10',
      lieu: null,
      loge: null,
      presences: [],
      candidats: [],
    });
    expect(Buffer.from(octets.slice(0, 5)).toString()).toBe('%PDF-');
  });

  it('ne se laisse pas casser par ce qui traîne dans une saisie libre', async () => {
    // Le contrôle qui compte vraiment : sans `lisible()`, ce document lèverait
    // une exception au dessin, et la route rendrait un 503.
    const octets = await construireCompteRendu({
      tenueLe: '2026-06-10',
      lieu: '🏛️ Temple',
      loge: 'Pau 中文',
      presences: [presence({ nom: 'ÉMOJI 👍', email: 'a b@example.org' })],
      candidats: [
        candidat({ commentaire: 'très bien 😀 — à revoir', recherche: 'ÉLÈVE… « oui »' }),
      ],
    });
    expect(Buffer.from(octets.slice(0, 5)).toString()).toBe('%PDF-');
  });

  it('passe à la page suivante quand la liste est longue', async () => {
    const beaucoup = Array.from({ length: 120 }, (_, i) =>
      candidat({ numero: 900 + i, commentaire: 'un commentaire assez long pour occuper la cellule' }),
    );
    const octets = await construireCompteRendu({
      tenueLe: '2026-06-10',
      lieu: null,
      loge: 'Pau',
      presences: Array.from({ length: 40 }, () => presence()),
      candidats: beaucoup,
    });
    // Le document se relit pour être compté : pdf-lib comprime ses objets,
    // chercher « /Type /Page » dans les octets ne trouve rien.
    const relu = await PDFDocument.load(octets);
    expect(relu.getPageCount()).toBeGreaterThan(1);
  });
});
