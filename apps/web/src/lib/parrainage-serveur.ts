import { empreinte } from './invitation';
import type { LigneDeParrainage, Modeles } from './parrainage';
import { supabaseAdmin } from './supabase-admin';
import { supabaseServer } from './supabase-server';

/**
 * Les lectures du parcours de parrainage (migration 0057).
 *
 * Deux familles, deux clés, et jamais l'une pour l'autre :
 *
 *   · le référent lit par **sa session** — la base sait qui il est et ne lui
 *     rend que sa loge ;
 *   · le parrain et le candidat n'ont pas de session. **Le jeton est leur
 *     droit** : on en calcule l'empreinte, et la base ne répond que pour la
 *     ligne qui la porte. C'est alors seulement que la clé service_role entre
 *     en jeu — comme pour les invitations (`lib/invitation.ts`).
 */

/** Un jeton plausible : 32 octets en base64url. Le reste ne mérite pas une requête. */
function jetonPlausible(jeton: string): boolean {
  return /^[A-Za-z0-9_-]{40,64}$/.test(jeton);
}

export type ParrainageOuvert = {
  id: string;
  loge_nom: string | null;
  envoye_par_nom: string | null;
  parrain_email: string;
  valable: boolean;
  motif: 'deja_presente' | 'revoque' | 'expire' | null;
};

export async function lireParrainage(jeton: string): Promise<ParrainageOuvert | null> {
  if (!jetonPlausible(jeton)) return null;

  const { data, error } = await supabaseAdmin().rpc('parrainage_par_empreinte', {
    empreinte: empreinte(jeton),
  });

  if (error || !data || data.length === 0) return null;
  return data[0] as ParrainageOuvert;
}

export type CandidatureOuverte = {
  candidat_id: string;
  prenom: string | null;
  nom: string | null;
  email: string | null;
  type_emploi: string | null;
  loge_nom: string | null;
  valable: boolean;
  motif: 'deja_completee' | 'revoque' | 'expire' | null;
};

export async function lireCandidature(jeton: string): Promise<CandidatureOuverte | null> {
  if (!jetonPlausible(jeton)) return null;

  const { data, error } = await supabaseAdmin().rpc('candidature_par_empreinte', {
    empreinte: empreinte(jeton),
  });

  if (error || !data || data.length === 0) return null;
  return data[0] as CandidatureOuverte;
}

const COLONNES_DES_MODELES =
  'objet_parrain, mot_parrain, objet_relance_parrain, mot_relance_parrain, objet_candidat, mot_candidat';

/**
 * Les modèles de courriel de la commission. Sous la session quand il y en a
 * une — `parametre` est lisible par toute personne connectée —, sous la clé
 * serveur sinon, c'est-à-dire après qu'un jeton a été vérifié.
 */
export async function lireModeles(sansSession = false): Promise<Modeles> {
  const client = sansSession ? supabaseAdmin() : await supabaseServer();
  const { data } = await client.from('parametre').select(COLONNES_DES_MODELES).maybeSingle();
  return (data as Modeles | null) ?? {};
}

/** Les invitations de parrainage de ma loge, avec leur état. */
export async function listerParrainages(): Promise<LigneDeParrainage[]> {
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc('parrainages_de_ma_loge');
  return (data as LigneDeParrainage[]) ?? [];
}
