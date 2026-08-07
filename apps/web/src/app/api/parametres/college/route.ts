import { NextResponse } from 'next/server';
import { z } from 'zod';
import { lireCorps, origine, vientDUnFormulaire } from '@/lib/formulaire';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Ajouter un titre au collège. **Réservé aux administrateurs.**
 *
 * Rien n'est vérifié ici sur le droit : la policy `college_ecriture_admin`
 * (migration 0017) ne donne aucune ligne à écrire à qui n'est pas
 * administrateur, et l'insertion échoue d'elle-même. Cette route ne fait que
 * traduire son refus en une phrase française.
 */

const Formulaire = z.object({
  nom: z
    .string()
    .trim()
    .min(1, 'Un titre ne peut pas être vide.')
    .max(120, 'Ce titre est trop long.'),
});

export const RETOUR = '/espace/parametres/college';

export async function POST(requete: Request) {
  try {
    return await traiter(requete);
  } catch (souci) {
    console.error('[college] échec inattendu', souci);
    return NextResponse.json(
      { erreur: 'Le service est momentanément indisponible. Réessayez dans un instant.' },
      { status: 503 },
    );
  }
}

async function traiter(requete: Request) {
  const natif = vientDUnFormulaire(requete);

  const repondre = (code: string | null, message: string | null, statut = 400) => {
    if (natif) {
      const vers = new URL(RETOUR, origine(requete));
      if (code) vers.searchParams.set('erreur', code);
      return NextResponse.redirect(vers, 303);
    }
    return code
      ? NextResponse.json({ erreur: message }, { status: statut })
      : NextResponse.json({ ok: true });
  };

  const lu = Formulaire.safeParse(await lireCorps(requete));
  if (!lu.success) return repondre('vide', lu.error.issues[0]?.message ?? 'Titre invalide.');

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return repondre('session', 'Session expirée.', 401);

  const { error } = await supabase.from('college').insert({ nom: lu.data.nom });

  if (error) {
    // 23505 : l'index unique sur `lower(btrim(nom))`. Le titre existe déjà,
    // peut-être à une majuscule près — le dire évite de chercher pourquoi
    // « Secrétaire » refuse d'entrer alors qu'on ne le voit pas.
    if (error.code === '23505') {
      return repondre('doublon', 'Ce titre est déjà dans la liste.', 409);
    }
    // 42501 : la policy. Un référent qui aurait forcé la porte.
    if (error.code === '42501') {
      return repondre('droit', 'Seul un administrateur peut tenir cette liste.', 403);
    }
    console.error('[college] insertion refusée', error);
    return repondre('echec', "Le titre n'a pas pu être ajouté.");
  }

  return repondre(null, null);
}
