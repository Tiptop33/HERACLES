import type { Content, ContentText, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { Variables } from './balisage';
import { blocTexte } from './mise-en-forme';
import type { Lecteur } from './reglages';

/**
 * Le CV anonyme : une page A4, faite pour circuler.
 *
 * C'est le modèle B, « La colonne », choisi le 10 novembre 2026 sur la planche
 * `docs/maquettes/cv-anonyme-propositions.html` : une colonne teintée à gauche
 * porte le numéro du dossier — en haut à gauche, sur un aplat — et ce qui se
 * lit d'un coup d'œil (début, mobilité, permis, savoir-être, informatique) ;
 * le parcours occupe la droite.
 *
 * CE QU'IL NE PORTE JAMAIS
 *
 * Nom, prénom, photo, âge, adresse, ville, téléphone, courriel, situation
 * familiale, loge, référent, parrain. Ils ne sont pas dans `DonneesCvAnonyme` :
 * le gabarit ne peut pas les imprimer, même par erreur. Ce que les champs
 * libres pourraient encore contenir — un nom d'employeur, un nom glissé dans
 * une expérience —, c'est la relecture du référent qui l'écarte (migration
 * 0073) : le lien public ne sert ce CV qu'une fois validé.
 *
 * Fonction pure, comme les autres gabarits : ni base, ni disque.
 */

export type DonneesCvAnonyme = {
  numero: number | null;
  /** « emploi », « stage », « stage en alternance », « changement d'Emploi » — les mots de Bubble. */
  type_emploi: string | null;
  emploi_recherche: string | null;
  secteur_activite_libelle: string | null;
  metier_libelle: string | null;
  /** Date ISO. */
  debut_stage: string | null;
  mobilite_geographique: string | null;
  permis_vl: string | null;
  vehicule: string | null;
  /** Une ligne par expérience : « 2019-2025 — Poste, employeur : missions ». */
  experiences: string | null;
  /** Une ligne par formation : « 2011 — Diplôme, établissement ». */
  formations: string | null;
  competences: string | null;
  savoir_etre: string | null;
  informatique: string | null;
  /** La date du CV : celle de sa validation, ou du jour pour un aperçu. Date ISO. */
  a_jour_le: string | null;
};

// ————————————————————————————————————————————————————————————————————————————
// Lire les champs de la fiche
// ————————————————————————————————————————————————————————————————————————————

/** Ce qu'une fiche, ou le lien public, fournit au CV. */
export type SourceDuCvAnonyme = {
  numero: number | null;
  type_emploi: string | null;
  emploi_recherche: string | null;
  secteur_activite_libelle: string | null;
  metier_libelle: string | null;
  debut_stage: string | null;
  mobilite_geographique: string | null;
  permis_vl: string | null;
  vehicule: string | null;
  experiences: string | null;
  formations: string | null;
  competences: string | null;
  savoir_etre: string | null;
  informatique: string | null;
};

/**
 * Les données du CV, recopiées **champ par champ** depuis la fiche : jamais la
 * fiche entière, qui porte aussi le nom, l'adresse et le téléphone. Ce qui
 * n'est pas nommé ici ne peut pas arriver jusqu'au PDF.
 */
export function donneesDuCvAnonyme(s: SourceDuCvAnonyme, aJourLe: string | null): DonneesCvAnonyme {
  return {
    numero: s.numero,
    type_emploi: s.type_emploi,
    emploi_recherche: s.emploi_recherche,
    secteur_activite_libelle: s.secteur_activite_libelle,
    metier_libelle: s.metier_libelle,
    debut_stage: s.debut_stage,
    mobilite_geographique: s.mobilite_geographique,
    permis_vl: s.permis_vl,
    vehicule: s.vehicule,
    experiences: s.experiences,
    formations: s.formations,
    competences: s.competences,
    savoir_etre: s.savoir_etre,
    informatique: s.informatique,
    a_jour_le: aJourLe,
  };
}

/** « CV anonyme - dossier 904.pdf » : le nom ne dit que le numéro. */
export function nomDuCvAnonyme(numero: number | null): string {
  return `CV anonyme${numero !== null ? ` - dossier ${numero}` : ''}.pdf`;
}

const majuscule = (s: string) => (s ? s.charAt(0).toLocaleUpperCase('fr-FR') + s.slice(1) : s);

/** Les lignes non vides d'un champ libre. */
export function lignes(texte: string | null | undefined): string[] {
  return (texte ?? '')
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/**
 * Les éléments d'une liste saisie à la main : une ligne par élément, ou à
 * défaut des virgules, points-virgules ou « · » sur une seule ligne — c'est
 * ainsi que beaucoup de fiches de Bubble sont remplies.
 */
export function elements(texte: string | null | undefined): string[] {
  const parLigne = lignes(texte);
  if (parLigne.length !== 1) return parLigne;
  return parLigne[0]
    .split(/\s*[;·•]\s*|\s*,\s+(?![^()]*\))/)
    .map((e) => majuscule(e.trim()))
    .filter(Boolean);
}

export type Etape = { periode: string; intitule: string; lieu: string; detail: string };

/**
 * Une expérience ou une formation, dans la forme que produit la lecture du CV
 * (`lib/lecture-cv.ts`) : « 2019-2025 — Poste, employeur, ville : missions ».
 * Une ligne qui ne suit pas cette forme reste entière, en intitulé.
 */
export function parcours(texte: string | null | undefined): Etape[] {
  return lignes(texte).map((ligne) => {
    let periode = '';
    let reste = ligne;
    const m = /^(.{1,24}?)\s+[—–]\s+(.+)$/.exec(ligne);
    if (m && /\d/.test(m[1])) {
      periode = m[1].replace(/(\d{4})\s*-\s*(\d{4})/g, '$1 – $2');
      reste = m[2];
    }
    const deuxPoints = reste.indexOf(' : ');
    const tete = deuxPoints >= 0 ? reste.slice(0, deuxPoints) : reste;
    const virgule = tete.indexOf(', ');
    return {
      periode,
      intitule: virgule >= 0 ? tete.slice(0, virgule) : tete,
      lieu: virgule >= 0 ? majuscule(tete.slice(virgule + 2)) : '',
      detail: deuxPoints >= 0 ? majuscule(reste.slice(deuxPoints + 3)) : '',
    };
  });
}

export type Recherche = 'emploi' | 'alternance' | 'stage' | 'changement';

/** La famille de recherche, depuis les mots de Bubble. */
export function familleDeRecherche(type: string | null | undefined): Recherche | null {
  const t = (type ?? '').toLocaleLowerCase('fr-FR');
  if (t.includes('alternance')) return 'alternance';
  if (t.includes('changement')) return 'changement';
  if (t.includes('stage')) return 'stage';
  if (t.includes('emploi')) return 'emploi';
  return null;
}

const COURT: Record<Recherche, string> = {
  emploi: 'Emploi',
  alternance: 'Alternance',
  stage: 'Stage',
  changement: 'Changement d’emploi',
};

const LONG: Record<Recherche, string> = {
  emploi: 'Recherche un emploi',
  alternance: 'Recherche une alternance',
  stage: 'Recherche un stage',
  changement: 'Souhaite changer d’emploi',
};

/**
 * Le permis, tel qu'un CV l'écrit : seulement s'il est là. Un CV ne dit pas
 * ce que la personne n'a pas.
 */
export function permisLisible(permis: string | null | undefined, vehicule: string | null | undefined): string | null {
  const p = (permis ?? '').trim();
  if (!p || /^non$/i.test(p)) return null;
  if (!/^oui$/i.test(p)) return `Permis B : ${p}`;
  const v = (vehicule ?? '').trim();
  if (/^oui$/i.test(v)) return 'Permis B, véhiculé';
  if (/^non$/i.test(v)) return 'Permis B, sans véhicule';
  return 'Permis B';
}

const MOIS = new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'UTC' });

/** « 6 avril 2027 ». */
export function jourEnLettres(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getUTCDate() === 1 ? '1er' : d.getUTCDate()} ${MOIS.format(d)} ${d.getUTCFullYear()}`;
}

/** Le numéro tel que réglé : « N° », rien, ou « Dossier » devant. */
export function numeroEcrit(numero: number | null, ecriture: string): { avant: string; chiffres: string } {
  const chiffres = numero === null ? '—' : String(numero);
  if (ecriture === 'nu') return { avant: '', chiffres };
  if (ecriture === 'dossier') return { avant: 'Dossier', chiffres };
  return { avant: 'N°', chiffres };
}

export function variablesDuCvAnonyme(d: DonneesCvAnonyme, r: Lecteur): Variables {
  return {
    numero: d.numero ?? '',
    contact: r.texte('contact.adresse').trim(),
    date: jourEnLettres(d.a_jour_le),
  };
}

// ————————————————————————————————————————————————————————————————————————————
// La page
// ————————————————————————————————————————————————————————————————————————————

const MM = 72 / 25.4;
const LARGEUR = 595.28;
const HAUTEUR = 841.89;
/** La colonne : 63 mm. */
const COLONNE = 63 * MM;
/** L'aplat du numéro, en haut de la colonne, sur la première page. */
const APLAT = 52 * MM;
const MARGE_HAUT = 14 * MM;
/** Le bas réserve la place du contact, au pied de la colonne. */
const MARGE_BAS = 26 * MM;
const COLONNE_GAUCHE = 11 * MM;
const COLONNE_DROITE = 8 * MM;
const CORPS_GAUCHE = 11 * MM;
const CORPS_DROITE = 14 * MM;

const ENCRE = '#141a22';
const TEXTE = '#1d232b';
const GRIS = '#5d6978';
const FILET = '#d5dce5';

/** Petites capitales espacées : les titres de rubrique. */
const etiquette = (texte: string, couleur: string, taille = 6.6): ContentText => ({
  text: texte.toLocaleUpperCase('fr-FR'),
  font: 'Poppins',
  bold: true,
  fontSize: taille,
  characterSpacing: taille * 0.16,
  color: couleur,
});

export function definitionDuCvAnonyme(d: DonneesCvAnonyme, r: Lecteur): TDocumentDefinitions {
  const aplat = r.couleur('couleur.aplat');
  const fond = r.couleur('couleur.colonne');
  const accent = r.couleur('couleur.accent');
  const titres = r.couleur('couleur.titres');
  const v = variablesDuCvAnonyme(d, r);
  const famille = familleDeRecherche(d.type_emploi);
  const largeurCote = COLONNE - COLONNE_GAUCHE - COLONNE_DROITE;

  // ——— La colonne ———————————————————————————————————————————————————————

  // L'en-tête de la colonne, posé sur l'aplat de la première page.
  const numero = numeroEcrit(d.numero, r.choix('numero.ecriture'));
  const tailleNumero = r.nombre('numero.taille');
  const entete: Content[] = [];
  const sur = r.texte('entete.sur').trim();
  if (sur) entete.push({ ...etiquette(sur, '#ffffff', 6.4), opacity: 0.85, margin: [0, 0, 0, 2] });
  entete.push({
    text: [
      ...(numero.avant ? [{ text: `${numero.avant} `, fontSize: tailleNumero * 0.28 }] : []),
      { text: numero.chiffres, fontSize: tailleNumero, characterSpacing: -tailleNumero * 0.03 },
    ],
    font: 'Poppins',
    bold: true,
    color: '#ffffff',
    lineHeight: 0.92,
  });
  if (famille) {
    entete.push({
      margin: [0, 6, 0, 0],
      table: { body: [[{ ...etiquette(COURT[famille], '#ffffff', 6.4), margin: [3, 1, 3, 0] }]] },
      layout: {
        hLineWidth: () => 0.8,
        vLineWidth: () => 0.8,
        hLineColor: () => '#ffffff',
        vLineColor: () => '#ffffff',
        paddingLeft: () => 2,
        paddingRight: () => 2,
        paddingTop: () => 1.5,
        paddingBottom: () => 0.5,
      },
    });
  }

  const blocCote = (titre: string, contenu: Content | null): Content | null =>
    contenu
      ? {
          margin: [0, 15, 0, 0],
          stack: [
            etiquette(titre, titres),
            { canvas: [{ type: 'line', x1: 0, y1: 3.5, x2: largeurCote, y2: 3.5, lineWidth: 0.8, lineColor: accent }] },
            { stack: [contenu], margin: [0, 5, 0, 0] },
          ],
        }
      : null;
  const texteCote = (valeur: string | null | undefined): Content | null =>
    valeur?.trim() ? { text: valeur.trim(), fontSize: 8.8, lineHeight: 1.12, color: TEXTE } : null;
  const listeCote = (texte: string | null | undefined): Content | null => {
    const items = elements(texte);
    return items.length ? { stack: items.map((t) => ({ text: t, fontSize: 8.8, lineHeight: 1.12, color: TEXTE, margin: [0, 0, 0, 1.5] })) } : null;
  };

  const cote: Content[] = [
    blocCote('Début souhaité', texteCote(jourEnLettres(d.debut_stage))),
    blocCote('Mobilité', texteCote(d.mobilite_geographique)),
    blocCote('Permis', texteCote(permisLisible(d.permis_vl, d.vehicule))),
    blocCote('Savoir-être', listeCote(d.savoir_etre)),
    blocCote('Informatique', listeCote(d.informatique)),
  ].filter((x): x is Content => x !== null);

  // ——— Le corps ——————————————————————————————————————————————————————————

  const intitule = d.emploi_recherche?.trim() || d.metier_libelle?.trim() || '';
  const meta = [d.secteur_activite_libelle, d.metier_libelle !== intitule ? d.metier_libelle : null]
    .map((x) => x?.trim())
    .filter(Boolean)
    .join(' · ');

  const corps: Content[] = [];
  if (famille) corps.push(etiquette(LONG[famille], titres, 6.8));
  if (intitule) {
    corps.push({ text: intitule, font: 'Poppins', bold: true, fontSize: 18.5, lineHeight: 0.98, color: ENCRE, margin: [0, 5, 0, 0] });
  }
  corps.push({ canvas: [{ type: 'rect', x: 0, y: 0, w: 18 * MM, h: 2.6, color: accent }], margin: [0, 11, 0, 7] });
  if (meta) corps.push({ text: meta, fontSize: 9, color: GRIS });

  const titreDeSection = (titre: string): Content => ({
    margin: [0, 17, 0, 8],
    columnGap: 6,
    columns: [
      { width: 7.4, canvas: [{ type: 'rect', x: 0, y: 3.4, w: 7.4, h: 7.4, r: 1, color: accent }] },
      { width: '*', text: titre, font: 'Poppins', bold: true, fontSize: 10.2, color: ENCRE },
    ],
  });

  const etapes = (texte: string | null | undefined): Content[] =>
    parcours(texte).map((e, i) => ({
      margin: [0, i === 0 ? 0 : 9, 0, 0],
      table: {
        widths: ['*'],
        body: [
          [
            {
              stack: [
                {
                  columns: [
                    { width: '*', text: e.intitule, font: 'Poppins', bold: true, fontSize: 9.4, lineHeight: 1.05, color: ENCRE },
                    ...(e.periode
                      ? [{ width: 'auto' as const, text: e.periode, fontSize: 8.4, bold: true, color: titres, margin: [8, 1.5, 0, 0] as [number, number, number, number] }]
                      : []),
                  ],
                },
                ...(e.lieu ? [{ text: e.lieu, fontSize: 8.7, color: GRIS, margin: [0, 0.5, 0, 0] as [number, number, number, number] }] : []),
                ...(e.detail ? [{ text: e.detail, fontSize: 9.3, lineHeight: 1.12, color: TEXTE, margin: [0, 1.5, 0, 0] as [number, number, number, number] }] : []),
              ],
            },
          ],
        ],
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: (i: number) => (i === 0 ? 0.8 : 0),
        vLineColor: () => FILET,
        paddingLeft: () => 13,
        paddingRight: () => 0,
        paddingTop: () => 0,
        paddingBottom: () => 0,
      },
    }));

  const experiences = etapes(d.experiences);
  if (experiences.length) corps.push(titreDeSection('Expériences'), ...experiences);
  const formations = etapes(d.formations);
  if (formations.length) corps.push(titreDeSection('Formation'), ...formations);

  const competences = elements(d.competences);
  if (competences.length) {
    const moitie = Math.ceil(competences.length / 2);
    const puces = (items: string[]): Content => ({
      ul: items.map((t) => ({ text: t, margin: [0, 0, 0, 2] as [number, number, number, number] })),
      markerColor: accent,
      fontSize: 9.3,
      lineHeight: 1.1,
      color: TEXTE,
    });
    corps.push(titreDeSection('Compétences'), {
      columnGap: 17,
      columns: [
        { width: '*', stack: [puces(competences.slice(0, moitie))] },
        { width: '*', stack: competences.length > 1 ? [puces(competences.slice(moitie))] : [] },
      ],
    });
  }

  // ——— Le pied de la colonne : le contact, la date ———————————————————————

  const pied: Content[] = [
    // Sans adresse réglée, pas de phrase qui invite à écrire à personne.
    v.contact ? blocTexte(r, 'contact', v) : null,
    v.date ? blocTexte(r, 'date', v) : null,
  ].filter((x): x is ContentText => x !== null);

  return {
    pageSize: 'A4',
    pageMargins: [0, MARGE_HAUT, 0, MARGE_BAS],
    defaultStyle: { font: 'Roboto', fontSize: 9.3, color: TEXTE },
    info: {
      title: `CV anonyme${d.numero !== null ? ` - dossier ${d.numero}` : ''}`,
      creator: 'HERACLES',
      producer: 'HERACLES',
    },
    // La colonne teintée sur toute la hauteur, l'aplat du numéro en haut de la
    // première page.
    background: (page: number) => ({
      canvas: [
        { type: 'rect', x: 0, y: 0, w: COLONNE, h: HAUTEUR, color: fond },
        ...(page === 1 ? [{ type: 'rect' as const, x: 0, y: 0, w: COLONNE, h: APLAT, color: aplat }] : []),
      ],
    }),
    // Au pied de la colonne, sur chaque page : la colonne seule, le corps à côté reste libre.
    footer: () => ({
      columnGap: 0,
      columns: [
        { width: COLONNE, stack: pied, margin: [COLONNE_GAUCHE, 0, COLONNE_DROITE, 0] },
        { width: '*', text: '' },
      ],
    }),
    content: [
      { stack: entete, absolutePosition: { x: COLONNE_GAUCHE, y: MARGE_HAUT } },
      {
        columnGap: 0,
        columns: [
          { width: COLONNE, stack: cote, margin: [COLONNE_GAUCHE, APLAT - MARGE_HAUT - 4, COLONNE_DROITE, 0] },
          { width: LARGEUR - COLONNE, stack: corps, margin: [CORPS_GAUCHE, 0, CORPS_DROITE, 0] },
        ],
      },
    ],
  };
}
