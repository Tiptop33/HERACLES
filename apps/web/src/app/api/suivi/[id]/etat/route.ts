import { NextResponse } from 'next/server';
import { z } from 'zod';
import { destinationInterne, lireCorps, origine, vientDUnFormulaire } from '@/lib/formulaire';
import { A_FAIRE, TERMINEE } from '@/lib/journal';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Refermer une tâche, ou la rouvrir.
 *
 * Rien n'est vérifié ici sur le droit : `changer_etat_du_suivi()` (migration
 * 0024) n'agit que si l'appelant a le droit de voir la fiche du candidat, et
 * ne touche qu'à la colonne `etat`. Elle rend `false` plutôt que de lever
 * quand la ligne est hors de portée — de l'extérieur, une tâche qu'on n'a pas
 * le droit de voir et une tâche qui n'existe pas se ressemblent, et c'est
 * voulu.
 *
 * Cette route ne fait que traduire sa réponse en une phrase française.
 */

const Formulaire = z.object({
  // Deux valeurs, et pas un champ libre : l'écran ne propose que de refermer
  // ou de rouvrir. Les autres états restent lisibles, ils viennent de Bubble.
  etat: z.enum([A_FAIRE, TERMINEE], { message: 'Cet état ne se pose pas ici.' }),
  retour: z.string().optional(),
});

export async function POST(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return await traiter(requete, (await params).id);
  } catch (souci) {
    console.error('[suivi/etat] échec inattendu', souci);
    return NextResponse.json(
      { erreur: 'Le service est momentanément indisponible. Réessayez dans un instant.' },
      { status: 503 },
    );
  }
}

async function traiter(requete: Request, ligne: string) {
  const natif = vientDUnFormulaire(requete);
  const corps = await lireCorps(requete);
  const demande = destinationInterne(corps?.retour);

  const repondre = (code: string | null, message: string | null, statut = 400) => {
    if (natif) {
      const vers = new URL(demande ?? '/espace/suivi', origine(requete));
      if (code) vers.searchParams.set('erreur', code);
      return NextResponse.redirect(vers, 303);
    }
    return code
      ? NextResponse.json({ erreur: message }, { status: statut })
      : NextResponse.json({ ok: true });
  };

  if (!/^[0-9a-f-]{36}$/i.test(ligne)) {
    return repondre('introuvable', 'Cette tâche n’existe pas.', 404);
  }

  const lu = Formulaire.safeParse(corps);
  if (!lu.success) {
    return repondre('etat', lu.error.issues[0]?.message ?? 'État invalide.');
  }

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return repondre('session', 'Session expirée.', 401);

  const { data, error } = await supabase.rpc('changer_etat_du_suivi', {
    ligne,
    nouvel_etat: lu.data.etat,
  });

  if (error) {
    // 42501 : pas de fiche de référent rattachée. Administrer n'est pas
    // accompagner — la fonction le refuse d'elle-même.
    if (error.code === '42501') {
      return repondre(
        'sans-fiche',
        'Votre compte n’est rattaché à aucune fiche de référent.',
        403,
      );
    }
    console.error('[suivi/etat] changement refusé', error);
    return repondre('echec', 'La tâche n’a pas pu être mise à jour.');
  }

  // `false` : la ligne n'existe pas, ou elle est hors de la loge.
  if (data === false) {
    return repondre('introuvable', 'Cette tâche n’existe pas, ou elle ne vous est pas visible.', 404);
  }

  return repondre(null, null);
}
