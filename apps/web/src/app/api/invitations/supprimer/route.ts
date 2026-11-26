import { NextResponse } from 'next/server';
import { z } from 'zod';
import { lireCorps, origine, vientDUnFormulaire } from '@/lib/formulaire';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Supprimer une invitation, quel que soit son état. **Réservé aux
 * administrateurs.**
 *
 * Une route à part, et non un verbe `DELETE` sur `/api/invitations` : un
 * formulaire HTML ne sait envoyer qu'un `POST`, et la fenêtre de confirmation
 * doit marcher avant que la moindre ligne de script ne soit chargée. Le nom
 * fixe `supprimer` passe devant le segment `[jeton]` voisin.
 *
 * Même ordre que pour émettre et modifier : la session, le droit métier, puis
 * seulement la clé service_role. `supprimer_invitation` (migration 0107) refait
 * le contrôle d'administrateur côté base ; la table n'a aucune policy de
 * suppression.
 */

const Suppression = z.object({
  id: z.uuid("L'invitation n'est pas reconnue."),
});

/** Les codes que l'écran d'administration sait traduire. */
type Refus = 'absente' | 'droit' | 'session' | 'echec';

export async function POST(requete: Request) {
  try {
    return await supprimer(requete);
  } catch (souci) {
    console.error('[invitations] échec inattendu de la suppression', souci);
    return NextResponse.json(
      { erreur: 'Le service est momentanément indisponible. Réessayez dans un instant.' },
      { status: 503 },
    );
  }
}

async function supprimer(requete: Request) {
  const natif = vientDUnFormulaire(requete);

  // Le formulaire natif revient au tableau ; le message s'affiche là-bas.
  const repondre = (code: Refus | null, message: string | null, statut = 400) => {
    if (natif) {
      const vers = new URL('/espace/admin', origine(requete));
      if (code) vers.searchParams.set('erreur', code);
      return NextResponse.redirect(vers, 303);
    }
    return code
      ? NextResponse.json({ erreur: message }, { status: statut })
      : NextResponse.json({ ok: true });
  };

  const lu = Suppression.safeParse(await lireCorps(requete));
  if (!lu.success) return repondre('absente', "Cette invitation n'existe plus.", 404);

  // 1. La session.
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return repondre('session', 'Session expirée.', 401);

  // 2. Le droit métier. La RLS ne laisse lire que son propre profil.
  const { data: profil } = await supabase.from('profil').select('role').single();
  if (profil?.role !== 'admin') {
    return repondre('droit', 'Seul un administrateur peut supprimer une invitation.', 403);
  }

  // 3. Alors seulement la clé qui contourne la RLS.
  const { error: souci } = await supabaseAdmin().rpc('supprimer_invitation', {
    emetteur: user.id,
    cible: lu.data.id,
  });

  if (souci) {
    if (souci.code === 'P0002') return repondre('absente', "Cette invitation n'existe plus.", 404);
    if (souci.code === '42501') {
      return repondre('droit', 'Seul un administrateur peut supprimer une invitation.', 403);
    }
    console.error('[invitations] suppression refusée', souci);
    return repondre('echec', "L'invitation n'a pas pu être supprimée.", 400);
  }

  return repondre(null, null);
}
