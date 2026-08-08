import { NextResponse } from 'next/server';
import { z } from 'zod';
import { destinationInterne, lireCorps, origine, vientDUnFormulaire } from '@/lib/formulaire';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Retirer une note du journal, ou l'y rendre.
 *
 * **Retirer n'est pas effacer** : la ligne quitte les écrans, elle reste en
 * base avec qui l'a retirée et quand (migration 0025). C'est ce qui permet de
 * revenir sur un geste fait par erreur — et c'est la raison pour laquelle le
 * journal n'a toujours aucune policy de suppression.
 *
 * Les droits sont ceux de la base : `retirer_le_suivi()` et `rendre_le_suivi()`
 * n'agissent que sur une ligne dont l'appelant a le droit de voir la fiche.
 */

const Formulaire = z.object({
  // Le seul choix : écarter, ou rappeler.
  geste: z.enum(['retirer', 'rendre'], { message: 'Ce geste n’existe pas.' }),
  retour: z.string().optional(),
});

export async function POST(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return await traiter(requete, (await params).id);
  } catch (souci) {
    console.error('[suivi/retirer] échec inattendu', souci);
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
    return repondre('introuvable', 'Cette note n’existe pas.', 404);
  }

  const lu = Formulaire.safeParse(corps);
  if (!lu.success) {
    return repondre('echec', lu.error.issues[0]?.message ?? 'Geste invalide.');
  }

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return repondre('session', 'Session expirée.', 401);

  const { data, error } = await supabase.rpc(
    lu.data.geste === 'retirer' ? 'retirer_le_suivi' : 'rendre_le_suivi',
    { ligne },
  );

  if (error) {
    if (error.code === '42501') {
      return repondre(
        'sans-fiche',
        'Votre compte n’est rattaché à aucune fiche de référent.',
        403,
      );
    }
    console.error('[suivi/retirer] geste refusé', error);
    return repondre('echec', 'La note n’a pas pu être mise à jour.');
  }

  if (data === false) {
    return repondre('introuvable', 'Cette note n’existe pas, ou elle ne vous est pas visible.', 404);
  }

  return repondre(null, null);
}
