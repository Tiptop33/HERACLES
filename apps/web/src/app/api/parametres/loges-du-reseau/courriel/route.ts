import { NextResponse } from 'next/server';
import { z } from 'zod';
import { indisponible, ouvrir } from '../acces';

/**
 * Régler le courriel envoyé aux Secrétaires des loges du réseau : son objet
 * et son texte (décision 27). Chaque changement s'enregistre aussitôt. Le texte
 * doit garder {lien} — la base le refuse sinon (0091).
 */
const Demande = z
  .object({
    objet: z.string().trim().min(1, 'L’objet ne peut pas être vide.').max(200, 'Cet objet est trop long.'),
    texte: z
      .string()
      .max(5000, 'Ce texte est trop long.')
      .refine((t) => t.trim() !== '', 'Le texte ne peut pas être vide.')
      .refine((t) => t.includes('{lien}'), 'Le texte doit garder {lien} : sans lui, le Secrétaire ne reçoit rien à ouvrir.'),
  })
  .strict();

export async function PATCH(requete: Request) {
  try {
    const acces = await ouvrir();
    if (!acces.ok) return acces.reponse;

    const lu = Demande.safeParse(await requete.json().catch(() => null));
    if (!lu.success) {
      return NextResponse.json({ erreur: lu.error.issues[0]?.message ?? 'Demande illisible.' }, { status: 400 });
    }

    const { data, error } = await acces.supabase.rpc('regler_le_courriel_des_loges_du_reseau', {
      l_objet: lu.data.objet,
      le_texte: lu.data.texte,
    });
    if (error) {
      if (error.code === '23514') {
        return NextResponse.json({ erreur: 'L’objet et le texte doivent être remplis, et le texte garder {lien}.' }, { status: 400 });
      }
      if (error.code === '42501') {
        return NextResponse.json({ erreur: 'Le courriel se règle par l’administration.' }, { status: 403 });
      }
      console.error('[loges du réseau] courriel', error.code);
      return indisponible();
    }
    return NextResponse.json({ courriel: data });
  } catch (souci) {
    console.error('[loges du réseau] courriel : échec inattendu', souci);
    return indisponible();
  }
}
