import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { definitionDeLAffiche } from '../src/lib/documents/affiche';
import { definitionDeLAffichette } from '../src/lib/documents/affichette';
import { definitionDuCompteRendu } from '../src/lib/documents/compte-rendu';
import { definitionDuCvAnonyme, type DonneesCvAnonyme } from '../src/lib/documents/cv-anonyme';
import { exempleDAffiche, exempleDAffichette, exempleDeCompteRendu, exempleDeCvAnonyme } from '../src/lib/documents/exemples';
import type { DocumentCle, Reglages } from '../src/lib/documents/gabarits';
import { imagesDuDocument, rendre } from '../src/lib/documents/moteur';
import { lecteur } from '../src/lib/documents/reglages';

/**
 * Les trois documents, produits pour de bon, puis relus.
 *
 * Le contrôle qui compte pour l'affiche et l'affichette n'est pas leur allure
 * mais ce qu'elles ne disent pas : elles circulent, et aucun nom de candidat ne
 * doit s'y trouver. On relit donc le texte réellement posé sur la page.
 *
 * pdfmake écrit avec des polices embarquées en Identity-H : chaque glyphe est
 * un numéro, et la table ToUnicode de la police dit quel caractère il porte.
 * La relecture ci-dessous fait ce que fait un lecteur de PDF : elle suit la
 * police courante et traduit les numéros. Les mots sont posés un à un ; on les
 * recolle par ligne.
 */
function relire(octets: Uint8Array): { texte: string; liens: string[]; pages: number } {
  const brut = Buffer.from(octets);
  const latin = brut.toString('latin1');

  const objets = new Map<number, { dico: string; flux: Buffer | null }>();
  for (const m of latin.matchAll(/(\d+) 0 obj([\s\S]*?)endobj/g)) {
    const corps = m[2];
    const debut = corps.indexOf('stream');
    let flux: Buffer | null = null;
    if (debut >= 0) {
      const depart = (m.index ?? 0) + m[0].indexOf('stream') + 'stream'.length;
      const saut = latin[depart] === '\r' ? 2 : 1;
      const fin = latin.indexOf('endstream', depart);
      flux = brut.subarray(depart + saut, fin);
      try {
        flux = inflateSync(flux);
      } catch {
        // flux non compressé
      }
    }
    objets.set(Number(m[1]), { dico: debut >= 0 ? corps.slice(0, debut) : corps, flux });
  }

  const tables = new Map<number, Map<number, string>>();
  const table = (num: number) => {
    let t = tables.get(num);
    if (t) return t;
    t = new Map();
    const cmap = objets.get(num)?.flux?.toString('latin1') ?? '';
    for (const bloc of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
      for (const r of bloc[1].matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]+)>\s*\[([^\]]*)\]/gi)) {
        const depart = parseInt(r[1], 16);
        [...r[3].matchAll(/<([0-9a-f ]+)>/gi)].forEach((v, i) =>
          t!.set(depart + i, Buffer.from(v[1].replace(/ /g, ''), 'hex').swap16().toString('utf16le')),
        );
      }
    }
    tables.set(num, t);
    return t;
  };

  const lignes: string[] = [];
  const liens: string[] = [];
  let pages = 0;
  for (const [, o] of objets) {
    if (!/\/Type \/Page\b(?!s)/.test(o.dico)) continue;
    pages += 1;
    const contenu = Number(/\/Contents (\d+) 0 R/.exec(o.dico)?.[1]);
    const ressources = objets.get(Number(/\/Resources (\d+) 0 R/.exec(o.dico)?.[1]))?.dico ?? '';
    const polices = new Map<string, Map<number, string>>();
    for (const p of ressources.matchAll(/\/(F\d+) (\d+) 0 R/g)) {
      const unicode = Number(/\/ToUnicode (\d+) 0 R/.exec(objets.get(Number(p[2]))?.dico ?? '')?.[1]);
      polices.set(p[1], table(unicode));
    }
    const flux = objets.get(contenu)?.flux?.toString('latin1') ?? '';
    let police = new Map<number, string>();
    const parY = new Map<string, string>();
    let y = '';
    for (const op of flux.matchAll(/\/(F\d+) [\d.]+ Tf|1 0 0 1 [\d.]+ ([\d.]+) Tm|\[([^\]]*)\] TJ/g)) {
      if (op[1]) police = polices.get(op[1]) ?? new Map();
      else if (op[2]) y = op[2];
      else if (op[3] !== undefined) {
        let mot = '';
        for (const h of op[3].matchAll(/<([0-9a-f]*)>/gi)) {
          for (let i = 0; i < h[1].length; i += 4) mot += police.get(parseInt(h[1].slice(i, i + 4), 16)) ?? '';
        }
        parY.set(`${pages}:${y}`, (parY.get(`${pages}:${y}`) ?? '') + mot);
      }
    }
    lignes.push(...parY.values());
    for (const annot of (o.dico.match(/\/Annots \[([^\]]*)\]/)?.[1] ?? '').matchAll(/(\d+) 0 R/g)) {
      // L'adresse est dans l'action du lien, en ligne ou dans un objet à part.
      const dico = objets.get(Number(annot[1]))?.dico ?? '';
      const action = /\/A (\d+) 0 R/.exec(dico);
      const source = action ? (objets.get(Number(action[1]))?.dico ?? '') : dico;
      const uri = /\/URI \(([^)]*)\)/.exec(source)?.[1];
      if (uri) liens.push(uri);
    }
  }
  return { texte: lignes.join('\n').replace(/ /g, ' '), liens, pages };
}

const RACINE = 'https://heracles.exemple.org';

async function produire(document: DocumentCle, ecarts: Reglages, definir: (r: ReturnType<typeof lecteur>, presentes: Set<string>) => Parameters<typeof rendre>[0]) {
  const r = lecteur(document, ecarts);
  const images = imagesDuDocument(document, new Map(), () => false);
  return relire(await rendre(definir(r, new Set(images.keys())), images));
}

describe('le compte rendu', () => {
  it('porte les présences, les dossiers en cours et leur dernière remarque', async () => {
    const d = exempleDeCompteRendu();
    const { texte, pages } = await produire('compte_rendu', {}, (r, p) => definitionDuCompteRendu(d, r, p));
    expect(texte).toContain('PRÉSENCES');
    expect(texte).toContain('ARNAUD Basile');
    expect(texte).toContain('06 00 00 00 10');
    expect(texte).toContain('LISTE DES CANDIDATS');
    expect(texte).toContain('Attente du deuxième entretien.');
    expect(texte).toContain('Compte-Rendu des travaux de la commission du Mer 28 Octobre, 2026');
    expect(texte).toContain('a traité, à ce jour plus de 904 dossiers.');
    // La liste des candidats commence sur sa propre page, comme l'original.
    expect(pages).toBe(2);
    expect(texte).toContain('1 / 2');
  });

  it('annonce la réunion suivante reportée quand elle tombe un jour férié', async () => {
    const d = exempleDeCompteRendu(); // réunion du 28 octobre 2026
    const { texte } = await produire('compte_rendu', {}, (r, p) => definitionDuCompteRendu(d, r, p));
    expect(texte).toContain('12/11/2026');
    expect(texte).not.toContain('11/11/2026');
  });

  it('préfère la réunion suivante déjà inscrite au registre', async () => {
    const d = exempleDeCompteRendu();
    d.commission.prochaine_reunion = '2026-11-19';
    const { texte } = await produire('compte_rendu', {}, (r, p) => definitionDuCompteRendu(d, r, p));
    expect(texte).toContain('19/11/2026');
  });

  it('obéit aux réglages : un texte changé, une colonne masquée', async () => {
    const d = exempleDeCompteRendu();
    const { texte } = await produire(
      'compte_rendu',
      { 'presences.titre.texte': 'ÉMARGEMENT', 'presences.col.email.visible': false },
      (r, p) => definitionDuCompteRendu(d, r, p),
    );
    expect(texte).toContain('ÉMARGEMENT');
    expect(texte).not.toContain('basile.arnaud@exemple.org');
  });

  it('tient une réunion sans personne ni dossier', async () => {
    const d = { ...exempleDeCompteRendu(), presences: [], candidats: [], offres: [] };
    const { texte } = await produire('compte_rendu', {}, (r, p) => definitionDuCompteRendu(d, r, p));
    expect(texte).toContain('PRÉSENCES');
  });

  it('ne se laisse pas casser par une saisie libre', async () => {
    const d = exempleDeCompteRendu();
    d.candidats[0].commentaire = 'Rappeler ✅ — “urgent”  ; ligne\r\nsuivante 🙂 **gras**';
    const { texte } = await produire('compte_rendu', {}, (r, p) => definitionDuCompteRendu(d, r, p));
    expect(texte).toContain('Rappeler');
  });
});

describe('l’affiche', () => {
  it('liste les dossiers par numéro, date et intitulé', async () => {
    const d = exempleDAffiche(RACINE);
    const { texte } = await produire('affiche', {}, (r, p) => definitionDeLAffiche(d, r, p));
    expect(texte).toContain('4 DOSSIERS EN SOUFFRANCE');
    expect(texte).toContain('mercredi 14 octobre 2026');
    expect(texte).toContain('901');
    expect(texte).toContain('27/11/2025');
    expect(texte).toContain('ASSISTANTE DE DIRECTION');
  });

  it('ne porte aucun nom de candidat, ni de référent, ni de commentaire', async () => {
    const cr = exempleDeCompteRendu();
    const d = exempleDAffiche(RACINE);
    const { texte } = await produire('affiche', {}, (r, p) => definitionDeLAffiche(d, r, p));
    for (const c of cr.candidats) {
      expect(texte).not.toContain(c.nom!);
      if (c.prenom) expect(texte).not.toContain(c.prenom);
      if (c.commentaire) expect(texte).not.toContain(c.commentaire);
    }
    expect(texte).not.toContain('ARNAUD');
  });

  it('met le lien du CV anonyme sur les seuls dossiers qui en ont un', async () => {
    const d = exempleDAffiche(RACINE);
    const { liens } = await produire('affiche', {}, (r, p) => definitionDeLAffiche(d, r, p));
    const cv = liens.filter((l) => l.includes('/cv-anonyme/'));
    expect(cv).toHaveLength(d.dossiers.filter((x) => x.lienCvAnonyme).length);
    expect(cv.every((l) => l.startsWith(`${RACINE}/cv-anonyme/`))).toBe(true);
  });

  it('fait des adresses de l’encadré des contacts des liens', async () => {
    const d = exempleDAffiche(RACINE);
    const { liens, texte } = await produire('affiche', {}, (r, p) => definitionDeLAffiche(d, r, p));
    expect(liens).toContain('mailto:president@exemple.org');
    expect(texte).toContain('Président de la Commission HERACLES');
  });

  it('accorde « dossier » au singulier', async () => {
    const d = { ...exempleDAffiche(RACINE) };
    d.dossiers = d.dossiers.slice(0, 1);
    const { texte } = await produire('affiche', {}, (r, p) => definitionDeLAffiche(d, r, p));
    expect(texte).toContain('1 DOSSIER EN SOUFFRANCE');
  });
});

describe('l’affichette', () => {
  it('reprend le dossier, la commission, son vénérable et le rayon d’action', async () => {
    const d = exempleDAffichette(RACINE);
    const { texte } = await produire('affichette', {}, (r, p) => definitionDeLAffichette(d, r, p));
    expect(texte).toContain('Mes BCFF');
    expect(texte).toContain('Dossier 904');
    expect(texte).toContain('Recherche un emploi');
    expect(texte).toContain('DIRECTEUR DES OPÉRATIONS');
    expect(texte).toContain('Agglomération');
    expect(texte).toContain('Prénom NOM');
    expect(texte).toContain('Président de la commission HERACLES emploi.');
    expect(texte).toContain('CV ANONYME CANDIDAT');
  });

  it('accorde l’article : « une alternance »', async () => {
    const d = { ...exempleDAffichette(RACINE), type_emploi: 'Alternance' };
    const { texte } = await produire('affichette', {}, (r, p) => definitionDeLAffichette(d, r, p));
    expect(texte).toContain('Recherche une alternance');
  });

  it('ne met ni QR code ni légende sans CV anonyme', async () => {
    const avec = await rendre(
      definitionDeLAffichette(exempleDAffichette(RACINE), lecteur('affichette'), new Set()),
      new Map(),
    );
    const sansLien = { ...exempleDAffichette(RACINE), lienCvAnonyme: null };
    const sans = await rendre(definitionDeLAffichette(sansLien, lecteur('affichette'), new Set()), new Map());
    expect(relire(sans).texte).not.toContain('CV ANONYME');
    // Le QR code, ce sont des centaines de petits rectangles : sans lui, la page s'allège.
    expect(sans.length).toBeLessThan(avec.length);
  });

  it('se passe de l’emblème qu’on a masqué', async () => {
    const d = exempleDAffichette(RACINE);
    const r = lecteur('affichette', { 'decor.cordeliere.visible': false });
    const definition = definitionDeLAffichette(d, r, new Set(['decor.cordeliere', 'decor.colonne']));
    expect(JSON.stringify(definition.content)).not.toContain('"decor.cordeliere"');
  });
});

describe('le CV anonyme', () => {
  const cv = (d: DonneesCvAnonyme, ecarts: Reglages = {}) =>
    produire('cv_anonyme', ecarts, (r) => definitionDuCvAnonyme(d, r));

  it('porte le numéro, ce qui est recherché et le parcours, sur une page', async () => {
    const { texte, pages } = await cv(exempleDeCvAnonyme());
    expect(texte).toContain('904');
    expect(texte).toContain('N°');
    expect(texte).toContain('RECHERCHE UN EMPLOI');
    expect(texte).toContain('Directeur des opérations, second');
    expect(texte).toContain('Conducteur de travaux principal');
    expect(texte).toContain('2012 – 2019');
    expect(texte).toContain('Licence professionnelle Management de chantier');
    expect(texte).toContain('Permis B, véhiculé');
    expect(texte).toContain('CV à jour au 4 novembre 2026');
    expect(pages).toBe(1);
  });

  it('n’imprime rien qui identifie la personne, même si on le lui passe', async () => {
    // Le type ne les connaît pas ; une route qui passerait la fiche entière
    // ne les ferait pas apparaître pour autant.
    const fiche = {
      ...exempleDeCvAnonyme(),
      nom: 'SECRETNOM',
      prenom: 'Secretprenom',
      email: 'secret@exemple.org',
      telephone: '0600009999',
      ville: 'Secretville',
      age: 41,
    } as DonneesCvAnonyme;
    const { texte } = await cv(fiche);
    for (const mot of ['SECRETNOM', 'Secretprenom', 'secret@exemple.org', '0600009999', '06 00 00 99 99', 'Secretville', '41 ans']) {
      expect(texte).not.toContain(mot);
    }
  });

  it('n’invite à écrire à personne tant qu’aucune adresse n’est réglée', async () => {
    const sans = await cv(exempleDeCvAnonyme());
    expect(sans.texte).not.toContain('Pour rencontrer ce candidat');
    const avec = await cv(exempleDeCvAnonyme(), { 'contact.adresse': 'commission@exemple.org' });
    // La phrase passe à la ligne dans la colonne : on la relit d'un seul tenant.
    expect(avec.texte.replace(/\s+/g, ' ')).toContain('Pour rencontrer ce candidat, écrire à commission@exemple.org en citant le n° 904.');
  });

  it('écrit le numéro comme on l’a réglé', async () => {
    const { texte } = await cv(exempleDeCvAnonyme(), { 'numero.ecriture': 'dossier' });
    expect(texte).toContain('Dossier 904');
  });

  it('tient une fiche presque vide', async () => {
    const vide: DonneesCvAnonyme = {
      numero: 905,
      type_emploi: null,
      emploi_recherche: 'Magasinier',
      secteur_activite_libelle: null,
      metier_libelle: null,
      debut_stage: null,
      mobilite_geographique: null,
      permis_vl: null,
      vehicule: null,
      experiences: null,
      formations: null,
      competences: null,
      savoir_etre: null,
      informatique: null,
      a_jour_le: null,
    };
    const { texte, pages } = await cv(vide);
    expect(texte).toContain('905');
    expect(texte).toContain('Magasinier');
    expect(texte).not.toContain('Expériences');
    expect(pages).toBe(1);
  });

  it('passe sur une seconde page plutôt que de couper un long parcours', async () => {
    const d = exempleDeCvAnonyme();
    const long = { ...d, experiences: [d.experiences, d.experiences, d.experiences].join('\n') };
    const { pages } = await cv(long);
    expect(pages).toBe(2);
  });

  it('ne se laisse pas mettre en forme par une saisie libre', async () => {
    const d = { ...exempleDeCvAnonyme(), experiences: '2020 — **Poste**, {numero} : *rien*' };
    const { texte } = await cv(d);
    expect(texte).toContain('**Poste**');
    expect(texte).toContain('{numero}');
  });
});

