import { NextResponse } from 'next/server';
import { z } from 'zod';
import { origine, vientDUnFormulaire } from '@/lib/formulaire';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Effacer un compte rendu, une affiche ou une affichette archivés — la
 * corbeille rouge de l'accueil, après sa fenêtre de confirmation.
 *
 * **Administrateur, Vénérable Maître et Secrétaire**, chacun dans sa loge,
 * l'administrateur partout. L'ordre du projet :
 *
 *   1. la session ;
 *   2. le droit et l'effacement, d'un seul geste : `effacer_un_document()`
 *      (migration 0069) refuse à qui n'a pas le titre, et ne trouve rien hors
 *      de sa loge ;
 *   3. alors seulement `supabaseAdmin()`, pour retirer du seau le fichier
 *      dont la base vient de rendre le chemin.
 *
 * Un `POST` d'un formulaire, et non un `DELETE` : la corbeille marche avant
 * qu'une ligne de script soit chargée. On revient toujours à l'accueil — rien
 * de ce qui vient de la requête ne choisit où l'on atterrit.
 */

const ACCUEIL = '/espace/accueil';

export async function POST(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return await traiter(requete, (await params).id);
  } catch (souci) {
    console.error('[documents/effacer] échec inattendu', souci);
    return NextResponse.json(
      { erreur: 'Le service est momentanément indisponible. Réessayez dans un instant.' },
      { status: 503 },
    );
  }
}

async function traiter(requete: Request, id: string) {
  const natif = vientDUnFormulaire(requete);

  const repondre = (code: string | null, message: string | null, statut = 400) => {
    if (natif) {
      const vers = new URL(ACCUEIL, origine(requete));
      if (code) vers.searchParams.set('document', code);
      return NextResponse.redirect(vers, 303);
    }
    return code
      ? NextResponse.json({ erreur: message }, { status: statut })
      : NextResponse.json({ ok: true });
  };

  if (!z.uuid().safeParse(id).success) {
    return repondre('introuvable', 'Ce document n’existe plus.', 404);
  }

  // 1. La session.
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return repondre('session', 'Session expirée.', 401);

  // 2. Le droit et l'effacement : la base tranche, et elle seule.
  const { data, error } = await supabase.rpc('effacer_un_document', { document_choisi: id });
  if (error) {
    if (error.code === '42501') {
      return repondre('droit', 'Ce compte ne peut pas effacer de document.', 403);
    }
    console.error('[documents/effacer] effacement refusé', error.code);
    return repondre('echec', 'Le document n’a pas pu être effacé.');
  }

  const resultat = (data as { issue: string; chemin: string | null }[] | null)?.[0];
  if (resultat?.issue !== 'efface') {
    return repondre('introuvable', 'Ce document n’existe plus.', 404);
  }

  // 3. Le seau, enfin. Un compte rendu porte des coordonnées : il ne reste
  //    pas « au cas où » une fois qu'on a demandé de l'effacer.
  if (resultat.chemin) {
    const { error: souciMenage } = await supabaseAdmin()
      .storage.from('documents')
      .remove([resultat.chemin]);
    if (souciMenage) console.error('[documents/effacer] fichier non effacé', souciMenage.message);
  }

  return repondre(null, null);
}
