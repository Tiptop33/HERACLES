import { supabaseServer } from './supabase-server';
import { etatDuSuivi, tauxDeRemplissage, type Suivi } from './suivi';

/**
 * Lecture d'une fiche **par la table**, donc sous la RLS de 0006 : le référent
 * et le parrain, personne d'autre.
 *
 * C'est ce qui sert l'écran de correction, et c'est voulu : le poste de
 * travail lit par `fiche_candidat()` (0020) et montre toute la loge, mais
 * écrire reste réservé à qui accompagne. Les deux lectures ne se ressemblent
 * pas parce qu'elles ne répondent pas à la même question.
 *
 * Aucune de ces requêtes n'écrit « where referent_id = moi » : c'est la base
 * qui s'en charge. Un filtre oublié ici ne doit rien laisser fuir.
 */

/** Les colonnes que les écrans du lot 3 affichent. Pas d'étoile : on nomme. */
const COLONNES = [
  'id',
  'numero',
  'bubble_id',
  'nom',
  'prenom',
  'email',
  'telephone',
  'age',
  'situation_familiale',
  'ville',
  'code_postal',
  'adresse',
  'type_emploi',
  'emploi_recherche',
  'mobilite_geographique',
  'debut_stage',
  'secteur_activite_libelle',
  'metier_libelle',
  'formations',
  'experiences',
  'competences',
  'savoir_etre',
  'informatique',
  'permis_vl',
  'vehicule',
  'appreciation',
  'cloture',
  'archive',
  'cv_url',
  'cv_chemin',
  'cv_anonyme_url',
  'cv_anonyme_chemin',
  'lettre_motivation_url',
  'lettre_motivation_chemin',
  'referent_id',
  'parrain_id',
  'loge_id',
  'cree_le',
  'maj_le',
].join(', ');

export type Candidat = {
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
  cv_url: string | null;
  cv_chemin: string | null;
  cv_anonyme_url: string | null;
  cv_anonyme_chemin: string | null;
  lettre_motivation_url: string | null;
  lettre_motivation_chemin: string | null;
  referent_id: string | null;
  parrain_id: string | null;
  loge_id: string | null;
  cree_le: string | null;
  maj_le: string | null;
};

/** Un candidat, augmenté des deux indicateurs que la maquette affiche. */
export type CandidatSuivi = Candidat & {
  suivi: Suivi;
  remplissage: number;
};

export type ReferentCourant = {
  id: string;
  nom: string | null;
  prenom: string | null;
  loge: string | null;
};

function augmenter(candidat: Candidat): CandidatSuivi {
  return {
    ...candidat,
    suivi: etatDuSuivi(candidat),
    remplissage: tauxDeRemplissage(candidat),
  };
}

/**
 * La fiche de référent de la personne connectée, et sa loge. Renvoie `null`
 * quand le compte n'est rattaché à aucune fiche : la personne est connectée,
 * mais elle n'accompagne personne.
 */
export async function referentCourant(): Promise<ReferentCourant | null> {
  const supabase = await supabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('referent')
    .select('id, nom, prenom, loge_id')
    .eq('profil_id', user.id)
    .maybeSingle();

  if (!data) return null;

  let loge: string | null = null;
  if (data.loge_id) {
    const { data: laLoge } = await supabase
      .from('loge')
      .select('nom')
      .eq('id', data.loge_id)
      .maybeSingle();
    loge = laLoge?.nom ?? null;
  }

  return { id: data.id, nom: data.nom, prenom: data.prenom, loge };
}

export type FicheCandidat = CandidatSuivi & {
  referent: string | null;
  parrain: string | null;
  loge: string | null;
};

/**
 * Une fiche, ou `null`. Un identifiant qui n'est pas rattaché à la personne
 * connectée donne `null` — non parce qu'on l'a filtré, mais parce que la base
 * ne renvoie rien. Changer l'adresse dans le navigateur ne change rien à cela.
 */
export async function lireCandidat(id: string): Promise<FicheCandidat | null> {
  const supabase = await supabaseServer();

  const { data } = await supabase.from('candidat').select(COLONNES).eq('id', id).maybeSingle();
  if (!data) return null;

  const candidat = data as unknown as Candidat;
  const augmente = augmenter(candidat);

  const identifiants = [candidat.referent_id, candidat.parrain_id].filter(
    (valeur): valeur is string => Boolean(valeur),
  );

  let referents: { id: string; nom: string | null; prenom: string | null }[] = [];
  if (identifiants.length > 0) {
    const { data: lus } = await supabase
      .from('referent')
      .select('id, nom, prenom')
      .in('id', identifiants);
    referents = lus ?? [];
  }

  const nommer = (identifiant: string | null) => {
    if (!identifiant) return null;
    const trouve = referents.find((personne) => personne.id === identifiant);
    if (!trouve) return null;
    return [trouve.prenom, trouve.nom].filter(Boolean).join(' ') || null;
  };

  let loge: string | null = null;
  if (candidat.loge_id) {
    const { data: laLoge } = await supabase
      .from('loge')
      .select('nom')
      .eq('id', candidat.loge_id)
      .maybeSingle();
    loge = laLoge?.nom ?? null;
  }

  return {
    ...augmente,
    referent: nommer(candidat.referent_id),
    parrain: nommer(candidat.parrain_id),
    loge,
  };
}
