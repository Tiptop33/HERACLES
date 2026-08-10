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
  /**
   * L'adresse du compte. Elle ne vient pas de la table `profil` mais de la
   * session : c'est `auth.users` qui la porte, et cette table-là n'est pas
   * lisible depuis l'application. Elle sert à nommer quelqu'un qui n'a pas
   * encore renseigné son nom.
   */
  email: string | null;
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

  if (!data) return null;
  return { ...(data as Omit<Profil, 'email'>), email: user.email ?? null };
}

/** Comme `profilCourant`, mais renvoie vers la connexion s'il n'y a personne. */
export async function exigerProfil(): Promise<Profil> {
  const profil = await profilCourant();
  if (!profil) redirect('/connexion');
  return profil;
}

/**
 * Ma fiche de référent, et si elle porte un visage (migration 0047).
 *
 * Séparé du profil, parce que ce n'en est pas : le compte porte la session,
 * la fiche de référent porte la photo. L'identifiant rendu est celui de la
 * **fiche** — c'est lui qu'attend `/espace/referents/<id>/photo`, et il n'est
 * pas celui du compte.
 *
 * `null` pour qui n'a pas de fiche : un administrateur, par exemple.
 */
export type MaPhoto = { referent_id: string; a_une_photo: boolean };

export async function lireMaPhoto(): Promise<MaPhoto | null> {
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc('ma_photo');
  return ((data as MaPhoto[]) ?? [])[0] ?? null;
}
