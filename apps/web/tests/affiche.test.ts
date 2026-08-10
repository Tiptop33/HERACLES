import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { construireAffiche, intitule, jourEntier } from '../src/lib/affiche';
import type { Dossier } from '../src/lib/dossiers';
import type { Poste } from '../src/lib/postes';

/**
 * L'affiche circule. Le contrôle qui compte ici n'est donc pas la mise en page
 * mais ce qu'elle ne dit pas : aucun nom de candidat ne doit s'y trouver.
 *
 * Pour l'éprouver vraiment, on relit le texte réellement posé sur la page.
 * `pdf-lib` écrit les chaînes en hexadécimal — les décoder donne ce qu'un
 * lecteur verra. À une réserve près : la relecture ci-dessous suppose du
 * latin-1, alors que la page est encodée en WinAnsi. Les deux ne diffèrent que
 * sur la plage 0x80-0x9F — apostrophes courbes, tirets cadratins —, qui
 * ressort donc en caractères de contrôle. Les contrôles portent pour cette
 * raison sur des fragments sans typographie : des noms, des numéros.
 */
function texteImprime(octets: Uint8Array): string {
  const tampon = Buffer.from(octets);
  const brut = tampon.toString('latin1');
  const morceaux: string[] = [];

  for (const debutFlux of brut.matchAll(/stream\r?\n/g)) {
    const debut = (debutFlux.index ?? 0) + debutFlux[0].length;
    const fin = tampon.indexOf('endstream', debut, 'latin1');
    if (fin < 0) continue;

    // Selon sa taille, `pdf-lib` laisse le flux en clair ou le comprime.
    let contenu = tampon.subarray(debut, fin);
    try {
      contenu = inflateSync(contenu);
    } catch {
      // déjà lisible
    }

    for (const m of contenu.toString('latin1').matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
      morceaux.push(Buffer.from(m[1], 'hex').toString('latin1'));
    }
  }
  return morceaux.join('\n');
}

function dossier(reste: Partial<Dossier> = {}): Dossier {
  return {
    candidat_id: '00000000-0000-0000-0000-000000000001',
    numero: 807,
    ouvert_le: '2025-06-18',
    emploi: 'Chef de travaux',
    recherche: 'DIRECTION DE TRAVAUX / CHEF DE TRAVAUX BTP',
    nom: 'BLAZQUEZ',
    prenom: 'Billy',
    referent_nom: 'LEMIEUX',
    commentaire: 'contact ce jour, attente réponse',
    a_un_cv: true,
    ...reste,
  };
}

describe('ce que l’affiche imprime d’un dossier', () => {
  it('préfère la recherche telle que la personne l’a écrite', () => {
    expect(intitule(dossier())).toBe('DIRECTION DE TRAVAUX / CHEF DE TRAVAUX BTP');
  });

  it('retombe sur le métier quand la recherche est vide', () => {
    expect(intitule(dossier({ recherche: null }))).toBe('Chef de travaux');
    expect(intitule(dossier({ recherche: '   ' }))).toBe('Chef de travaux');
  });

  it('dit quelque chose même quand les deux manquent', () => {
    // Une case vide au milieu d’un tableau se lit comme une erreur ; ici le
    // dossier existe, c’est son intitulé qui n’a pas été saisi.
    expect(intitule(dossier({ recherche: null, emploi: null }))).toBe('Recherche en cours');
  });

  it('écrit la date avec l’année entière, comme l’affiche d’origine', () => {
    expect(jourEntier('2025-06-18')).toBe('18/06/2025');
    expect(jourEntier(null)).toBe('');
  });
});

describe('ce que l’affiche ne dit pas', () => {
  it('ne porte aucun nom de candidat, ni de référent', async () => {
    const octets = await construireAffiche({
      tenueLe: '2026-06-10',
      loge: 'Gironde',
      dossiers: [dossier(), dossier({ numero: 811, nom: 'GIGUET', prenom: 'Julia' })],
      postes: [],
      contacts: [],
    });

    const texte = texteImprime(octets);

    // Le garde-fou du garde-fou : si l’extraction ne rendait rien, les trois
    // contrôles suivants passeraient sans rien éprouver.
    expect(texte).toContain('DOSSIERS EN SOUFFRANCE');

    expect(texte).not.toContain('BLAZQUEZ');
    expect(texte).not.toContain('GIGUET');
    expect(texte).not.toContain('Julia');
    expect(texte).not.toContain('LEMIEUX');
  });

  it('ne porte pas davantage les commentaires de suivi', async () => {
    const octets = await construireAffiche({
      tenueLe: '2026-06-10',
      loge: 'Gironde',
      dossiers: [dossier({ commentaire: 'ne doit pas circuler' })],
      postes: [],
      contacts: [],
    });
    expect(texteImprime(octets)).not.toContain('ne doit pas circuler');
  });

  it('porte en revanche le numéro, qui sert à demander la fiche', async () => {
    const octets = await construireAffiche({
      tenueLe: '2026-06-10',
      loge: 'Gironde',
      dossiers: [dossier({ numero: 807 })],
      postes: [],
      contacts: [],
    });
    expect(texteImprime(octets)).toContain('807');
  });
});

describe('le pied de l’affiche', () => {
  it('reste absent tant que l’installation n’a rien posé', async () => {
    const octets = await construireAffiche({
      tenueLe: '2026-06-10',
      loge: 'Gironde',
      dossiers: [dossier()],
      postes: [],
      contacts: [],
    });
    // Rien d’inventé, rien emprunté : l’affiche sort sans pied.
    expect(texteImprime(octets)).toContain('EN SOUFFRANCE');
    expect(texteImprime(octets)).not.toContain('Présidente');
  });

  it('imprime les lignes de contact quand elles sont réglées', async () => {
    const octets = await construireAffiche({
      tenueLe: '2026-06-10',
      loge: 'Gironde',
      dossiers: [dossier()],
      postes: [],
      contacts: ['Camille EXEMPLE, Présidente, Tél : 00 00 00 00 00'],
    });
    expect(texteImprime(octets)).toContain('Camille EXEMPLE');
  });
});

function poste(reste: Partial<Poste> = {}): Poste {
  return {
    id: '00000000-0000-0000-0000-0000000000aa',
    intitule: '6 ARCHITECTES',
    societe: 'SAS EXEMPLE',
    ville: 'Albi',
    contact: 'Camille EXEMPLE',
    email: 'recrutement@exemple.test',
    remonte_le: '2026-06-01',
    ...reste,
  };
}

describe('les postes à pourvoir', () => {
  it('paraissent avec leur société, leur ville et leur contact', async () => {
    const octets = await construireAffiche({
      tenueLe: '2026-06-10', loge: 'Gironde', dossiers: [dossier()],
      postes: [poste()], contacts: [],
    });
    const texte = texteImprime(octets);
    expect(texte).toContain('POSTE');
    expect(texte).toContain('6 ARCHITECTES');
    expect(texte).toContain('SAS EXEMPLE');
    expect(texte).toContain('Camille EXEMPLE');
    expect(texte).toContain('recrutement@exemple.test');
  });

  it('laissent le document muet quand il n’y a rien à proposer', async () => {
    // Un titre suivi d’un tableau vide, sur une feuille qu’on punaise, se lit
    // comme une panne plutôt que comme « rien ce mois-ci ».
    const octets = await construireAffiche({
      tenueLe: '2026-06-10', loge: 'Gironde', dossiers: [dossier()],
      postes: [], contacts: [],
    });
    expect(texteImprime(octets)).not.toContain('POSTE');
  });

  it('tiennent un poste dont on ne sait que l’intitulé', async () => {
    const octets = await construireAffiche({
      tenueLe: '2026-06-10', loge: null, dossiers: [],
      postes: [poste({ societe: null, ville: null, contact: null, email: null })],
      contacts: [],
    });
    expect(texteImprime(octets)).toContain('6 ARCHITECTES');
  });
});

describe('le document lui-même', () => {
  it('tient une réunion sans aucun dossier', async () => {
    const octets = await construireAffiche({
      tenueLe: '2026-06-10',
      loge: null,
      dossiers: [],
      postes: [],
      contacts: [],
    });
    expect(Buffer.from(octets.slice(0, 5)).toString()).toBe('%PDF-');
    expect(texteImprime(octets)).toContain('Aucun dossier en cours');
  });

  it('marque « CV » sur les seuls dossiers qui en ont un', async () => {
    const avec = await construireAffiche({
      tenueLe: '2026-06-10', loge: null, postes: [], contacts: [],
      dossiers: [dossier({ a_un_cv: true })],
    });
    const sans = await construireAffiche({
      tenueLe: '2026-06-10', loge: null, postes: [], contacts: [],
      dossiers: [dossier({ a_un_cv: false })],
    });
    expect(texteImprime(avec)).toContain('CV');
    // Le titre de colonne porte déjà « CV » : c’est la ligne qui doit changer.
    expect(texteImprime(avec).split('CV').length).toBeGreaterThan(
      texteImprime(sans).split('CV').length,
    );
  });

  it('ne se laisse pas casser par une saisie libre', async () => {
    const octets = await construireAffiche({
      tenueLe: '2026-06-10',
      loge: 'Gironde 中文',
      dossiers: [dossier({ recherche: 'ALTERNANCE 🚀 — 2ᵉ année' })],
      postes: [],
      contacts: ['Contact 👍'],
    });
    expect(Buffer.from(octets.slice(0, 5)).toString()).toBe('%PDF-');
  });
});
