import { redirect } from 'next/navigation';
import { supabaseServer } from './supabase-server';
import type { Role } from './roles';

export type Profil = {
  id: string;
  role: Role;
  nom: string | null;
  prenom: string | null;
  telephone: string | null;
  ville: string | null;
  code_postal: string | null;
  presentation: string | null;
};

/**
 * Le profil de la personne connectée, ou null. La RLS ne laissant lire que sa
 * propre ligne, il n'y a aucun filtre à écrire : `single()` suffit.
 */
export async function profilCourant(): Promise<Profil | null> {
  const supabase = await supabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('profil')
    .select('id, role, nom, prenom, telephone, ville, code_postal, presentation')
    .single();

  return (data as Profil) ?? null;
}

/** Comme `profilCourant`, mais renvoie vers la connexion s'il n'y a personne. */
export async function exigerProfil(): Promise<Profil> {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  return profil;
}
