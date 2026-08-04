import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase-server';

/** Chaîne facultative : vide ou blancs deviennent `null` en base. */
const texte = z
  .string()
  .trim()
  .max(2000)
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional();

const Formulaire = z.object({
  nom: texte,
  prenom: texte,
  telephone: texte,
  ville: texte,
  code_postal: texte,
  presentation: texte,
});

export async function PATCH(requete: Request) {
  const brut = await requete.json().catch(() => null);
  const lu = Formulaire.safeParse(brut);

  if (!lu.success) {
    return NextResponse.json({ erreur: 'Formulaire invalide.' }, { status: 400 });
  }

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ erreur: 'Session expirée.' }, { status: 401 });
  }

  // `eq('id', user.id)` double la RLS, qui interdit déjà d'écrire ailleurs :
  // sans clause, la requête viserait toute la table.
  // Le rôle n'est pas dans le formulaire, et un déclencheur SQL le fige de
  // toute façon : personne ne se promeut administrateur par ici.
  const { error } = await supabase.from('profil').update(lu.data).eq('id', user.id);

  if (error) {
    return NextResponse.json({ erreur: "L'enregistrement a échoué." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
