import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { construireAffichette, rubriques, type DossierAffichette } from '../src/lib/affichette';

/**
 * L'affichette est le document le plus exposé des trois : un seul dossier, une
 * page, faite pour circuler largement. Les contrôles portent donc d'abord sur
 * ce qu'elle ne dit pas.
 *
 * Comme pour l'affiche, on relit le texte réellement posé sur la page. La
 * relecture suppose du latin-1 là où la page est en WinAnsi : les deux ne
 * diffèrent que sur la plage 0x80-0x9F, d'où des contrôles portant sur des
 * fragments sans typographie.
 */
function texteImprime(octets: Uint8Array): string {
  const tampon = Buffer.from(octets);
  const morceaux: string[] = [];

  for (const debutFlux of tampon.toString('latin1').matchAll(/stream\r?\n/g)) {
    const debut = (debutFlux.index ?? 0) + debutFlux[0].length;
    const fin = tampon.indexOf('endstream', debut, 'latin1');
    if (fin < 0) continue;

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

function dossier(reste: Partial<DossierAffichette> = {}): DossierAffichette {
  return {
    numero: 839,
    type_emploi: 'Stage en alternance',
    emploi_recherche:
      'Conseiller en gestion de patrimoine ; conseil en placement, optimisation fiscale',
    metier_libelle: 'Conseiller en gestion de patrimoine',
    secteur_activite_libelle: 'Banque et assurance',
    mobilite_geographique: 'Régionale',
    ...reste,
  };
}

describe('les rubriques du dossier', () => {
  it('suit l’ordre du document d’origine', () => {
    expect(rubriques(dossier()).map(([titre]) => titre)).toEqual([
      'Recherche',
      'Poste',
      'Secteur',
      'Mobilité',
    ]);
  });

  it('n’imprime pas une rubrique vide', () => {
    // Mieux vaut une affichette courte qu'une affichette pleine de tirets.
    const court = rubriques(dossier({ secteur_activite_libelle: null, mobilite_geographique: '  ' }));
    expect(court.map(([titre]) => titre)).toEqual(['Recherche', 'Poste']);
  });

  it('retombe sur le métier quand l’intitulé manque', () => {
    const lignes = rubriques(dossier({ emploi_recherche: null }));
    expect(lignes).toContainEqual(['Poste', 'Conseiller en gestion de patrimoine']);
  });

  it('tient un dossier presque vide', () => {
    expect(
      rubriques({
        numero: 1,
        type_emploi: null,
        emploi_recherche: null,
        metier_libelle: null,
        secteur_activite_libelle: null,
        mobilite_geographique: null,
      }),
    ).toEqual([]);
  });
});

describe('ce que l’affichette ne dit pas', () => {
  it('ne porte que le numéro du dossier', async () => {
    const octets = await construireAffichette({ dossier: dossier(), contacts: [] });
    const texte = texteImprime(octets);

    // Le garde-fou du garde-fou : sans lui, les contrôles suivants passeraient
    // même si l'extraction ne rendait rien.
    expect(texte).toContain('839');
    expect(texte).toContain('Chers Fr');

    // Le type `DossierAffichette` n'accepte ni nom, ni ville, ni CV : le
    // document ne peut pas les imprimer, même par accident. Ce contrôle-ci
    // vaut pour le jour où quelqu'un élargira le type.
    expect(texte).not.toContain('@');
    expect(texte).not.toMatch(/\b0[1-9](\s?\d{2}){4}\b/);
  });

  it('sort sans signature tant que l’installation n’a rien réglé', async () => {
    // Les deux documents se comparent : c'est la seule façon d'éprouver une
    // absence sans se heurter au texte d'appel, qui parle lui aussi des Frères
    // et de la commission.
    const sans = texteImprime(
      await construireAffichette({ dossier: dossier(), contacts: [] }),
    );
    const avec = texteImprime(
      await construireAffichette({ dossier: dossier(), contacts: ['Camille EXEMPLE'] }),
    );
    expect(avec).toContain('Camille EXEMPLE');
    expect(sans).not.toContain('Camille EXEMPLE');
  });

  it('signe avec la première ligne de contact quand elle existe', async () => {
    const octets = await construireAffichette({
      dossier: dossier(),
      contacts: [
        'Camille EXEMPLE, Presidente de la commission',
        'Dominique ESSAI, Secretariat',
      ],
    });
    const texte = texteImprime(octets);
    expect(texte).toContain('Camille EXEMPLE');
    // Une seule signature : le secrétariat n'a pas à figurer sur l'affichette.
    expect(texte).not.toContain('Dominique ESSAI');
  });
});

describe('le document lui-même', () => {
  it('produit un PDF', async () => {
    const octets = await construireAffichette({ dossier: dossier(), contacts: [] });
    expect(Buffer.from(octets.slice(0, 5)).toString()).toBe('%PDF-');
  });

  it('tient un dossier sans numéro', async () => {
    const octets = await construireAffichette({
      dossier: dossier({ numero: null }),
      contacts: [],
    });
    expect(texteImprime(octets)).toContain('Dossier de ce mois');
  });

  it('ne se laisse pas casser par une saisie libre', async () => {
    const octets = await construireAffichette({
      dossier: dossier({ emploi_recherche: 'ALTERNANCE 🚀 中文 — 2ᵉ année' }),
      contacts: ['Contact 👍'],
    });
    expect(Buffer.from(octets.slice(0, 5)).toString()).toBe('%PDF-');
  });
});
