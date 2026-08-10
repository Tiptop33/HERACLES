import { dateEnLettres } from './format';
import { Feuille, lisible, type Colonne } from './pdf';
import { supabaseServer } from './supabase-server';

/**
 * Le compte rendu des travaux de la commission, tel que Bubble le sort après
 * chaque réunion — et qu'HERACLES doit savoir sortir avant la bascule.
 *
 * Deux tableaux, dans cet ordre :
 *
 *   1. la liste des candidats — les dossiers en cours, avec le dernier mot du
 *      journal de suivi, celui qu'on relit en séance ;
 *   2. les présences — la loge, son état du jour, et son taux sur l'exercice.
 *
 * Les deux viennent de `compte_rendu_candidats()` et `compte_rendu_presences()`
 * (migration 0055). Ce fichier ne décide de rien : il met en page ce que la
 * base rend, et la base ne rend jamais rien hors de la loge.
 */

export type LignePresence = {
  referent_id: string;
  nom: string | null;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
  etat: string | null;
  presences: number;
  taux: number;
};

export type LigneCandidatRendu = {
  candidat_id: string;
  numero: number | null;
  ouvert_le: string | null;
  emploi: string | null;
  recherche: string | null;
  nom: string | null;
  prenom: string | null;
  referent_nom: string | null;
  commentaire: string | null;
};

export async function lirePresences(reunion: string): Promise<LignePresence[]> {
  if (!/^[0-9a-f-]{36}$/i.test(reunion)) return [];
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc('compte_rendu_presences', { reunion_choisie: reunion });
  return (data as LignePresence[]) ?? [];
}

export async function lireCandidats(reunion: string): Promise<LigneCandidatRendu[]> {
  if (!/^[0-9a-f-]{36}$/i.test(reunion)) return [];
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc('compte_rendu_candidats', { reunion_choisie: reunion });
  return (data as LigneCandidatRendu[]) ?? [];
}

/**
 * L'en-tête et le texte de mission, repris du document d'origine.
 *
 * Ils sont ici faute d'un meilleur endroit : ce sont des réglages de la
 * province, pas du code. Ils rejoindront l'écran d'administration du lot 5,
 * avec les dates d'exercice — d'ici là, les changer demande un déploiement, ce
 * qui est acceptable pour trois lignes qui bougent tous les dix ans.
 */
const OBEDIENCE = 'GRANDE LOGE NATIONALE FRANÇAISE';
const PROVINCE = 'GRANDE LOGE PROVINCIALE DE GUYENNE ET GASCOGNE';
const MISSION =
  'La Commission « HERACLES » a été créée en 2001 sous l’impulsion du Grand Maître ' +
  'Provincial de l’époque. Elle a pour but de permettre aux Frères, épouses de Frères ' +
  'ou enfants de Frères en recherche d’emploi de retrouver au plus vite une situation ' +
  'professionnelle normale. Grâce à l’aide morale, au fait que le demandeur soit suivi, ' +
  'et surtout avec le soutien des membres de la commission, les demandeurs d’emploi se ' +
  'sentent plus motivés et sont donc plus actifs dans leurs recherches.';

/** L'abréviation portée par la colonne de droite du tableau des présences. */
export function marque(etat: string | null): string {
  if (etat === 'Présent') return 'P';
  if (etat === 'Excusé') return 'E';
  if (etat === 'Absent') return 'A';
  // Jamais appelé : la case reste vide, comme sur la feuille. Un tiret dirait
  // « on a regardé », et ce n'est pas la même chose.
  return '';
}

export function nomComplet(nom: string | null, prenom: string | null): string {
  return [nom, prenom].filter(Boolean).join(' ').trim();
}

export function jour(valeur: string | null): string {
  if (!valeur) return '';
  const [a, m, j] = valeur.slice(0, 10).split('-');
  return a && m && j ? `${j}/${m}/${a.slice(2)}` : '';
}

export async function construireCompteRendu(options: {
  tenueLe: string;
  lieu: string | null;
  loge: string | null;
  presences: LignePresence[];
  candidats: LigneCandidatRendu[];
}): Promise<Uint8Array> {
  const { tenueLe, lieu, loge, presences, candidats } = options;
  const feuille = await Feuille.ouvrir();

  feuille.centre(OBEDIENCE, { taille: 9, gras: false });
  feuille.centre(PROVINCE, { taille: 9, gras: false });
  feuille.espace(4);
  feuille.centre(`COMMISSION EMPLOI « HERACLES »${loge ? ` — ${loge}` : ''}`, { taille: 13 });
  feuille.centre(`Compte rendu des travaux de la commission du ${dateEnLettres(tenueLe)}`, {
    taille: 10,
    gras: false,
  });
  if (lieu) feuille.centre(lieu, { taille: 9, gras: false });

  feuille.espace(6);
  feuille.texte(MISSION, { taille: 7.5, interligne: 10 });
  feuille.trait();

  // ------------------------------------------------------------------ candidats
  feuille.espace(4);
  feuille.texte(`LISTE DES CANDIDATS — ${candidats.length} dossier${candidats.length > 1 ? 's' : ''} en cours`, {
    taille: 10,
    gras: true,
  });
  feuille.espace(2);

  const colonnesCandidats: Colonne[] = [
    { titre: 'N°', largeur: 30, aligne: 'droite' },
    { titre: 'DATE', largeur: 46 },
    { titre: 'EMPLOI RECHERCHÉ', largeur: 168 },
    { titre: 'NOM', largeur: 90 },
    { titre: 'RÉFÉRENT', largeur: 68 },
    { titre: 'COMMENTAIRES', largeur: 125 },
  ];

  feuille.tableau(
    colonnesCandidats,
    candidats.map((c) => [
      c.numero === null ? '' : String(c.numero),
      jour(c.ouvert_le),
      // Le court, puis le long : c'est ce que montre le document d'origine.
      [c.emploi, c.recherche].filter(Boolean).filter((v, i, t) => t.indexOf(v) === i).join(' — '),
      nomComplet(c.nom, c.prenom),
      c.referent_nom ?? '',
      c.commentaire ?? '',
    ]),
  );

  if (candidats.length === 0) {
    feuille.espace(2);
    feuille.texte('Aucun dossier en cours.', { taille: 8 });
  }

  // ------------------------------------------------------------------ présences
  feuille.espace(14);
  const venus = presences.filter((p) => p.etat === 'Présent').length;
  const excuses = presences.filter((p) => p.etat === 'Excusé').length;
  feuille.texte(
    `PRÉSENCES — ${venus} présent${venus > 1 ? 's' : ''}, ${excuses} excusé${excuses > 1 ? 's' : ''} ` +
      `sur ${presences.length}`,
    { taille: 10, gras: true },
  );
  feuille.espace(2);

  const colonnesPresences: Colonne[] = [
    { titre: 'NOM', largeur: 132 },
    { titre: 'E-MAIL', largeur: 170 },
    { titre: 'TÉLÉPHONE', largeur: 90 },
    { titre: 'RÉUNIONS', largeur: 55, aligne: 'droite' },
    { titre: 'PRÉSENCE', largeur: 55, aligne: 'droite' },
    { titre: '', largeur: 25, aligne: 'droite' },
  ];

  feuille.tableau(
    colonnesPresences,
    presences.map((p) => [
      nomComplet(p.nom, p.prenom),
      p.email ?? '',
      p.telephone ?? '',
      String(p.presences),
      `${p.taux} %`,
      marque(p.etat),
    ]),
  );

  return feuille.fermer();
}

/** Le nom du fichier téléchargé — daté, pour qu'il se range tout seul. */
export function nomDuFichier(tenueLe: string): string {
  return `compte-rendu-${lisible(tenueLe).slice(0, 10)}.pdf`;
}
