import { NextResponse } from 'next/server';
import { z } from 'zod';
import { lireCorps, origine, vientDUnFormulaire } from '@/lib/formulaire';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Renommer, déplacer ou retirer un titre du collège.
 *
 * Trois gestes, une seule route, distingués par un champ `action`. Le choix
 * mérite d'être dit : ailleurs dans ce dépôt, chaque geste a son adresse. Ici,
 * les trois portent sur la même ligne d'une liste de quelques entrées, et
 * trois fichiers pour trois lignes de code auraient plus caché que montré.
 *
 * Le droit n'est pas vérifié ici : la policy `college_ecriture_admin` et la
 * fonction `deplacer_college` (migration 0017) refusent d'elles-mêmes. Cette
 * route traduit leurs refus.
 */

const Formulaire = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('renommer'),
    nom: z.string().trim().min(1, 'Un titre ne peut pas être vide.').max(120),
  }),
  z.object({ action: z.literal('deplacer'), vers: z.enum(['haut', 'bas']) }),
  z.object({ action: z.literal('supprimer') }),
]);

const RETOUR = '/espace/parametres/college';

export async function POST(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return await traiter(requete, params);
  } catch (souci) {
    console.error('[college] échec inattendu', souci);
    return NextResponse.json(
      { erreur: 'Le service est momentanément indisponible. Réessayez dans un instant.' },
      { status: 503 },
    );
  }
}

async function traiter(requete: Request, params: Promise<{ id: string }>) {
  const { id } = await params;
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

  if (!z.uuid().safeParse(id).success) return repondre('absent', "Ce titre n'existe plus.", 404);

  const lu = Formulaire.safeParse(await lireCorps(requete));
  if (!lu.success) return repondre('formulaire', lu.error.issues[0]?.message ?? 'Geste inconnu.');

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return repondre('session', 'Session expirée.', 401);

  if (lu.data.action === 'deplacer') {
    const { error } = await supabase.rpc('deplacer_college', { cible: id, vers: lu.data.vers });
    if (error) {
      if (error.code === '42501') {
        return repondre('droit', 'Seul un administrateur peut ranger cette liste.', 403);
      }
      if (error.code === 'P0002') return repondre('absent', "Ce titre n'existe plus.", 404);
      console.error('[college] déplacement refusé', error);
      return repondre('echec', "La liste n'a pas pu être rangée.");
    }
    return repondre(null, null);
  }

  if (lu.data.action === 'renommer') {
    const { data, error } = await supabase
      .from('college')
      .update({ nom: lu.data.nom })
      .eq('id', id)
      .select('id');

    if (error) {
      if (error.code === '23505') {
        return repondre('doublon', 'Ce titre est déjà dans la liste.', 409);
      }
      console.error('[college] renommage refusé', error);
      return repondre('echec', "Le titre n'a pas pu être renommé.");
    }
    // Aucune ligne touchée : soit le titre n'existe plus, soit la policy a
    // refusé. On ne distingue pas les deux.
    if (!data || data.length === 0) return repondre('absent', "Ce titre n'existe plus.", 404);
    return repondre(null, null);
  }

  const { data, error } = await supabase.from('college').delete().eq('id', id).select('id');
  if (error) {
    console.error('[college] suppression refusée', error);
    return repondre('echec', "Le titre n'a pas pu être retiré.");
  }
  if (!data || data.length === 0) return repondre('absent', "Ce titre n'existe plus.", 404);

  return repondre(null, null);
}
