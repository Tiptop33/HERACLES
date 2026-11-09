import {
  aujourdhuiAParis,
  periodeDesDocuments,
  rangerParSorte,
  type DocumentArchive,
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

/**
 * Les comptes rendus, affiches et affichettes de la période, rangés dans leurs
 * trois colonnes (migration 0069).
 *
 * La période est l'exercice réglé dans Paramètres › Exercice. La
 * base fait le reste : la policy de `document` ne rend que ses loges, et la
 * fonction dit, ligne par ligne, si la corbeille a lieu d'être.
 */
export async function listerLesArchives(maintenant: Date = new Date()): Promise<Record<Sorte, DocumentArchive[]>> {
  const exercice = await lireLExercice();
  const { du, au } = periodeDesDocuments(exercice, aujourdhuiAParis(maintenant));

  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc('documents_de_l_accueil', { du, au });
  if (error) console.error('[accueil] archives illisibles', error.code);

  return rangerParSorte((data as DocumentArchive[] | null) ?? []);
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
