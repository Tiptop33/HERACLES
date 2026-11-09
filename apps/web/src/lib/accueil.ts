import {
  aujourdhuiAParis,
  periodeDesDocuments,
  rangerParSorte,
  type DocumentArchive,
  type Periode,
  type Sorte,
} from './documents/archives';
import { lireLExercice } from './exercice';
import { supabaseServer } from './supabase-server';

/**
 * Ce que l'accueil de la maquette `1a` a besoin de savoir.
 *
 * Les compteurs et les demandes en attente ne sont pas des requêtes sur des
 * tables : ce sont des appels à deux fonctions de la base (migration 0011).
 * La raison est dans la migration — ils portent sur des candidats que la
 * personne connectée n'a pas le droit de lire ligne à ligne, et une fonction
 * ne rend que ce que l'écran montre.
 */

export type Chiffres = {
  mesCandidats: number;
  enAttente: number;
  offresEnCours: number;
  referents: number;
  /** Les quatre familles de recherche, comptées sur les dossiers en cours (0032). */
  urgences: { emploi: number; alternance: number; stage: number; changement: number };
};

const AUCUN: Chiffres = {
  mesCandidats: 0,
  enAttente: 0,
  offresEnCours: 0,
  referents: 0,
  urgences: { emploi: 0, alternance: 0, stage: 0, changement: 0 },
};

export async function lireChiffres(): Promise<Chiffres> {
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc('accueil_chiffres').single();

  if (!data) return AUCUN;

  const ligne = data as Record<string, number | null>;
  return {
    mesCandidats: ligne.mes_candidats ?? 0,
    enAttente: ligne.en_attente ?? 0,
    offresEnCours: ligne.offres_en_cours ?? 0,
    referents: ligne.referents ?? 0,
    urgences: {
      emploi: ligne.urgence_emploi ?? 0,
      alternance: ligne.urgence_alternance ?? 0,
      stage: ligne.urgence_stage ?? 0,
      changement: ligne.urgence_changement ?? 0,
    },
  };
}

export type Demande = {
  id: string;
  prenom: string | null;
  nom: string | null;
  ville: string | null;
  /**
   * Vide quand le type de recherche ne se reconnaît pas (migration 0031). On
   * le dit plutôt que de ranger la personne dans « Emploi » par défaut : la
   * carte se lirait faux, et on ne saurait jamais que la colonne est à
   * remplir.
   */
  famille: 'emploi' | 'alternance' | 'stage' | 'changement' | null;
  cree_le: string | null;
};

export async function listerDemandesEnAttente(limite = 4): Promise<Demande[]> {
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc('demandes_en_attente', { limite });
  return (data as Demande[]) ?? [];
}

/** La période de l'accueil : l'exercice réglé dans Paramètres › Exercice. */
export async function periodeEnCours(maintenant: Date = new Date()): Promise<Periode> {
  return periodeDesDocuments(await lireLExercice(), aujourdhuiAParis(maintenant));
}

/**
 * Les comptes rendus, affiches et affichettes datés de la période, rangés dans
 * leurs trois colonnes (migration 0069).
 *
 * La base fait le reste : la policy de `document` ne rend que ses loges, et
 * `documents_de_l_accueil()` dit, ligne par ligne, si la corbeille a lieu
 * d'être. La fonction ne connaît que des bornes : elle sert aussi à
 * Paramètres › Archives, avec celles d'avant l'exercice.
 */
export async function listerLesDocuments(periode: Periode): Promise<Record<Sorte, DocumentArchive[]>> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc('documents_de_l_accueil', {
    du: periode.du,
    au: periode.au,
  });
  if (error) console.error('[archives] documents illisibles', error.code);

  return rangerParSorte((data as DocumentArchive[] | null) ?? []);
}

/** Ceux de l'exercice en cours — l'accueil. */
export async function listerLesArchives(maintenant: Date = new Date()) {
  return listerLesDocuments(await periodeEnCours(maintenant));
}

/** Un dossier clôturé depuis plus de deux mois, à archiver ou non (0071). */
export type DossierAArchiver = {
  candidat_id: string;
  numero: number | null;
  nom: string | null;
  prenom: string | null;
  /** Qui l'a refermé : Lui-même, Heraclés, Autre. */
  cloture: string | null;
  clos_le: string | null;
  /** La date vient de la dernière modification Bubble : « ≈ ». */
  estime: boolean;
};

/**
 * Les dossiers que la fenêtre de l'accueil propose d'archiver. La base ne
 * rend rien à qui n'est ni Vénérable Maître ni Secrétaire, et rien qui ait
 * été repoussé au-delà d'aujourd'hui (`dossiers_a_archiver()`, 0071).
 */
export async function listerLesDossiersAArchiver(): Promise<DossierAArchiver[]> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc('dossiers_a_archiver');
  if (error) console.error('[accueil] dossiers à archiver illisibles', error.code);
  return (data as DossierAArchiver[] | null) ?? [];
}

/** Ce que la route d'archivage répond quand elle refuse — un code, jamais un message. */
const REFUS_D_ARCHIVAGE: Record<string, string> = {
  droit: 'Seuls le Vénérable Maître et le Secrétaire tranchent l’archivage.',
  introuvable: 'Ce dossier n’est plus à trancher : il a été archivé, ou rouvert.',
  session: 'Votre session a expiré. Reconnectez-vous.',
  echec: 'La décision n’a pas pu être enregistrée. Réessayez dans un instant.',
};

export function phraseDeRefusDArchivage(code: string | null | undefined): string | null {
  if (!code) return null;
  return REFUS_D_ARCHIVAGE[code] ?? REFUS_D_ARCHIVAGE.echec;
}

export type Offre = {
  id: string;
  intitule: string | null;
  entreprise_nom: string | null;
  lieu_libelle: string | null;
  type_contrat_libelle: string | null;
};

/**
 * Les offres qui bougent encore. Trente jours : au-delà, une offre de France
 * Travail est presque toujours pourvue, et en proposer une éteinte fait perdre
 * son temps à tout le monde.
 */
export async function listerOffresEnCours(limite = 5): Promise<Offre[]> {
  const supabase = await supabaseServer();
  const bord = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

  const { data } = await supabase
    .from('offre_emploi')
    .select('id, intitule, entreprise_nom, lieu_libelle, type_contrat_libelle')
    .gt('date_actualisation', bord)
    .order('date_actualisation', { ascending: false })
    .limit(limite);
  return (data as Offre[]) ?? [];
}

/**
 * La saison en cours, à la façon des associations : elle commence en septembre.
 * En août 2026 on est encore dans « 2025-2026 » ; en septembre, on bascule.
 */
export function saison(maintenant = new Date()): string {
  const annee = maintenant.getFullYear();
  const debut = maintenant.getMonth() >= 8 ? annee : annee - 1;
  return `${debut}-${debut + 1}`;
}
