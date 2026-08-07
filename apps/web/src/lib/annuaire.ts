import { supabaseServer } from './supabase-server';

/**
 * L'annuaire des référents.
 *
 * La lecture passe par une fonction de la base (migration 0012) plutôt que par
 * la table : la carte affiche le nombre de candidats accompagnés, qui suppose
 * de compter des fiches que l'appelant n'a pas le droit de lire. Et la
 * fonction ne rend que ce que la carte montre — ni grade, ni immatriculation,
 * ni dernière visite.
 */

export type FicheAnnuaire = {
  id: string;
  nom: string | null;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
  photo_url: string | null;
  college: string | null;
  loge_id: string | null;
  loge_nom: string | null;
  compte_rattache: boolean;
  candidats_suivis: number;
};

export async function listerAnnuaire(): Promise<FicheAnnuaire[]> {
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc('annuaire_referents');
  return (data as FicheAnnuaire[]) ?? [];
}

/** Une fiche de l'annuaire, ou `null` — pour l'écran de modification. */
export async function lireFicheAnnuaire(id: string): Promise<FicheAnnuaire | null> {
  const fiches = await listerAnnuaire();
  return fiches.find((f) => f.id === id) ?? null;
}

/**
 * Filtre à la volée, sur ce qui est déjà affiché. La liste tient dans une page
 * — soixante-dix personnes au plus —, il n'y a rien à demander au serveur.
 */
export function filtrerAnnuaire(fiches: FicheAnnuaire[], recherche: string): FicheAnnuaire[] {
  const mots = recherche.trim().toLowerCase();
  if (!mots) return fiches;

  return fiches.filter((f) =>
    [f.nom, f.prenom, f.email, f.telephone, f.loge_nom, f.college]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(mots),
  );
}

/** « 23 membres · 4 sans compte », ou le vide quand la loge est vide. */
export function resumeDeLAnnuaire(fiches: FicheAnnuaire[]): string {
  if (fiches.length === 0) return 'personne pour l’instant';

  const sansCompte = fiches.filter((f) => !f.compte_rattache).length;
  const membres = `${fiches.length} membre${fiches.length > 1 ? 's' : ''}`;

  return sansCompte === 0
    ? membres
    : `${membres} · ${sansCompte} sans compte`;
}
