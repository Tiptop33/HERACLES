import { supabaseServer } from './supabase-server';
import {
  estArchive,
  estCloture,
  estFerme,
  etatDuSuivi,
  tauxDeRemplissage,
  type Suivi,
} from './suivi';

/**
 * Le poste de travail : la liste permanente des candidats de la loge, et la
 * fiche qui s'ouvre à côté (maquette 1c).
 *
 * Deux lectures, deux fonctions de la base — jamais la table :
 *
 *   · `candidats_de_la_loge()` (0019) rend la liste, et rien que ce que la
 *     liste affiche ;
 *   · `fiche_candidat()` (0020) rend une fiche, si l'appelant a le droit de la
 *     voir dans sa loge.
 *
 * Aucune de ces requêtes n'écrit « where loge_id = la mienne » : c'est la base
 * qui tranche. Un filtre oublié ici ne peut rien laisser fuir.
 */

/** Une ligne de la liste de gauche. Volontairement pauvre : c'est une liste. */
export type LigneCandidat = {
  id: string;
  numero: number | null;
  nom: string | null;
  prenom: string | null;
  age: number | null;
  /** Le métier, ou l'emploi recherché à défaut — jamais une case vide. */
  metier: string | null;
  ville: string | null;
  /** Les deux façons de refermer un dossier, reprises de Bubble. */
  cloture: string | null;
  archive: string | null;
  loge_id: string | null;
  loge_nom: string | null;
  referent_nom: string | null;
  a_une_photo: boolean;
  /** Elle ou il est mon suivi : mon candidat, ou celui que je parraine. */
  c_est_mon_suivi: boolean;
  /** Personne ne l'accompagne. C'est ce que la maquette appelle « urgent ». */
  sans_referent: boolean;
};

/** La fiche de droite, telle que 0020 la rend. */
export type Fiche = {
  id: string;
  numero: number | null;
  bubble_id: string | null;

  nom: string | null;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
  age: number | null;
  situation_familiale: string | null;
  ville: string | null;
  code_postal: string | null;
  adresse: string | null;

  type_emploi: string | null;
  emploi_recherche: string | null;
  mobilite_geographique: string | null;
  debut_stage: string | null;
  secteur_activite_libelle: string | null;
  metier_libelle: string | null;

  formations: string | null;
  experiences: string | null;
  competences: string | null;
  savoir_etre: string | null;
  informatique: string | null;
  permis_vl: string | null;
  vehicule: string | null;

  appreciation: string | null;
  cloture: string | null;
  archive: string | null;
  referent_nom: string | null;
  parrain_nom: string | null;
  loge_nom: string | null;

  cv_chemin: string | null;
  cv_url: string | null;
  cv_anonyme_chemin: string | null;
  cv_anonyme_url: string | null;
  lettre_motivation_chemin: string | null;
  lettre_motivation_url: string | null;
  a_une_photo: boolean;

  cree_le: string | null;
  maj_le: string | null;

  /** Le droit d'y écrire : référent ou parrain, et personne d'autre. */
  modifiable: boolean;
};

/** La fiche, augmentée des deux indicateurs calculés du lot 3. */
export type FicheOuverte = Fiche & {
  suivi: Suivi;
  remplissage: number;
};

export async function listerCandidatsDeLaLoge(): Promise<LigneCandidat[]> {
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc('candidats_de_la_loge');
  return (data as LigneCandidat[]) ?? [];
}

/**
 * Une fiche, ou `null`. Un identifiant hors de ses loges donne `null` — non
 * parce qu'on l'a filtré, mais parce que la base ne renvoie rien. Changer
 * l'adresse dans le navigateur ne change rien à cela.
 */
export async function lireFiche(id: string): Promise<FicheOuverte | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;

  const supabase = await supabaseServer();
  const { data } = await supabase.rpc('fiche_candidat', { candidat: id });

  const fiche = (data as Fiche[] | null)?.[0];
  if (!fiche) return null;

  return {
    ...fiche,
    suivi: etatDuSuivi(fiche),
    remplissage: tauxDeRemplissage(fiche),
  };
}

/**
 * Les trois états d'un dossier, et rien d'autre.
 *
 * La maquette proposait « Tous · Urgents · Mes suivis ». Aucun des trois n'a
 * survécu à l'usage : « Tous » mélangeait ouvert et refermé, « Urgents » et
 * « Mes suivis » découpaient une liste qu'on parcourt déjà d'un coup d'œil et
 * que la recherche retrouve mieux. Ce qu'on demande à ce volet, c'est de
 * savoir où en est un dossier.
 *
 * `CLOTURE` et `ARCHIVER` restent deux vues et non une : ce sont deux colonnes
 * distinctes chez Bubble, donc deux gestes distincts, et les confondre à
 * l'écran ferait perdre l'information au premier tri.
 */
export const VUES = [
  { valeur: 'en-cours', libelle: 'En cours' },
  { valeur: 'clotures', libelle: 'Clôturés' },
  { valeur: 'archives', libelle: 'Archivés' },
] as const;

export type Vue = (typeof VUES)[number]['valeur'];

/** Celle sur laquelle l'écran s'ouvre, et qui ne s'écrit pas dans l'adresse. */
export const VUE_PAR_DEFAUT: Vue = 'en-cours';

export function estVue(valeur: unknown): valeur is Vue {
  return VUES.some((v) => v.valeur === valeur);
}

export function filtrerParVue(lignes: LigneCandidat[], vue: Vue): LigneCandidat[] {
  if (vue === 'clotures') return lignes.filter(estCloture);
  if (vue === 'archives') return lignes.filter(estArchive);

  // Ce qui reste : ni clôturé, ni archivé. C'est le travail en cours.
  return lignes.filter((l) => !estFerme(l));
}

/**
 * La recherche porte sur ce qui est déjà à l'écran. Une loge compte quelques
 * dizaines de candidats — les parcourir coûte moins qu'un aller-retour, et
 * cela évite de recopier un mot saisi dans une expression de filtre.
 */
export function chercher(lignes: LigneCandidat[], recherche: string): LigneCandidat[] {
  const mot = recherche.trim().toLocaleLowerCase('fr');
  if (mot === '') return lignes;

  return lignes.filter((l) =>
    [l.nom, l.prenom, l.metier, l.ville, l.referent_nom, l.loge_nom, l.numero?.toString()]
      .filter(Boolean)
      .some((champ) => String(champ).toLocaleLowerCase('fr').includes(mot)),
  );
}

/** « 13 en cours », comme en tête du volet de la maquette. */
export function resumeDeLaLoge(lignes: LigneCandidat[]): string {
  const ouverts = lignes.filter((l) => !estFerme(l)).length;
  if (lignes.length === 0) return 'aucun';
  if (ouverts === 0) return 'aucun en cours';
  return `${ouverts} en cours`;
}

/** « MARTIN Julie », le nom en tête — c'est par là qu'on cherche quelqu'un. */
export function nomDeFamilleDabord(nom?: string | null, prenom?: string | null): string {
  return [nom?.trim(), prenom?.trim()].filter(Boolean).join(' ') || 'Sans nom';
}

/** « 34 ans · Metz », la seconde ligne d'un rang de la liste. */
export function sousTitreDuRang(ligne: LigneCandidat): string {
  return [ligne.metier, ligne.ville].filter(Boolean).join(' · ');
}
