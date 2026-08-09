import { NextResponse } from 'next/server';
import { z } from 'zod';
import { destinationInterne, lireCorps, origine, vientDUnFormulaire } from '@/lib/formulaire';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Régler les deux bornes de l'exercice.
 *
 * `regler_l_exercice()` (migration 0044) refuse d'elle-même une session qui
 * n'est pas administratrice, et une fin qui ne suit pas son début. Le contrôle
 * est là, pas ici.
 */

const Formulaire = z.object({
  debut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Cette date ne se lit pas.'),
  fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Cette date ne se lit pas.'),
  retour: z.string().optional(),
});

export async function POST(requete: Request) {
  try {
    return await traiter(requete);
  } catch (souci) {
    console.error('[parametres/exercice] échec inattendu', souci);
    return NextResponse.json(
      { erreur: 'Le service est momentanément indisponible. Réessayez dans un instant.' },
      { status: 503 },
    );
  }
}

async function traiter(requete: Request) {
  const natif = vientDUnFormulaire(requete);
  const corps = await lireCorps(requete);
  const demande = destinationInterne(corps?.retour);

  const repondre = (code: string | null, message: string | null, statut = 400) => {
    if (natif) {
      const vers = new URL(demande ?? '/espace/parametres/exercice', origine(requete));
      if (code) vers.searchParams.set('erreur', code);
      else vers.searchParams.set('regle', '1');
      return NextResponse.redirect(vers, 303);
    }
    return code
      ? NextResponse.json({ erreur: message }, { status: statut })
      : NextResponse.json({ ok: true });
  };

  const lu = Formulaire.safeParse(corps);
  if (!lu.success) return repondre('date', lu.error.issues[0]?.message ?? 'Dates invalides.');

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return repondre('session', 'Session expirée.', 401);

  const { data, error } = await supabase.rpc('regler_l_exercice', {
    debut: lu.data.debut,
    fin: lu.data.fin,
  });

  if (error) {
    if (error.code === '42501') {
      return repondre('droit', 'Seul un administrateur règle les dates d’exercice.', 403);
    }
    console.error('[parametres/exercice] réglage refusé', error);
    return repondre('echec', 'Les dates n’ont pas pu être enregistrées.');
  }

  if (data === 'ordre') {
    return repondre('ordre', 'La fin de l’exercice doit venir après son début.');
  }

  return repondre(null, null);
}
