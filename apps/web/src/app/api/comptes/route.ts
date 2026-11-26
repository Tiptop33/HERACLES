import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Changer le rôle et la loge d'un compte. **Réservé aux administrateurs.**
 *
 * Même ordre que pour les invitations : la session, le droit métier, puis
 * seulement la clé service_role — la seule qui laisse le déclencheur de 0001
 * changer un rôle. `modifier_compte` (migration 0109) refait le contrôle
 * d'administrateur et porte les refus : son propre rôle, le référent qui
 * accompagne des candidats, le compte d'un candidat, la loge sans fiche.
 */

const Modification = z.object({
  id: z.uuid("Ce compte n'est pas reconnu."),
  role: z.enum(['referent', 'chercheur', 'admin'], { message: "Ce rôle n'existe pas." }),
  loge_id: z.uuid('Cette loge n’est pas reconnue.').nullable(),
});

/** Ce que la base répond, traduit pour la personne qui a modifié. */
function refusDeLaBase(code: string | undefined): { erreur: string; statut: number } {
  switch (code) {
    case 'P0002':
      return { erreur: "Ce compte n'existe plus.", statut: 404 };
    case '23503':
      return { erreur: 'Cette loge n’existe plus.', statut: 400 };
    case '23514':
      return { erreur: 'Vous ne pouvez pas changer votre propre rôle.', statut: 409 };
    case '23001':
      return {
        erreur:
          'Ce compte accompagne encore des candidats : confiez-les à quelqu’un d’autre avant de lui retirer le rôle de référent.',
        statut: 409,
      };
    case '22023':
      return { erreur: 'Ce changement n’est pas possible pour ce compte.', statut: 409 };
    case '42501':
      return { erreur: 'Seul un administrateur peut modifier un compte.', statut: 403 };
    default:
      return { erreur: "Le compte n'a pas pu être modifié.", statut: 400 };
  }
}

export async function PATCH(requete: Request) {
  try {
    return await modifier(requete);
  } catch (souci) {
    console.error('[comptes] échec inattendu de la modification', souci);
    return NextResponse.json(
      { erreur: 'Le service est momentanément indisponible. Réessayez dans un instant.' },
      { status: 503 },
    );
  }
}

async function modifier(requete: Request) {
  const brut = await requete.json().catch(() => null);
  const lu = Modification.safeParse(brut);
  if (!lu.success) {
    return NextResponse.json(
      { erreur: lu.error.issues[0]?.message ?? 'Modification invalide.' },
      { status: 400 },
    );
  }

  // 1. La session.
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erreur: 'Session expirée.' }, { status: 401 });

  // 2. Le droit métier. La RLS ne laisse lire que son propre profil.
  const { data: profil } = await supabase.from('profil').select('role').single();
  if (profil?.role !== 'admin') {
    return NextResponse.json(
      { erreur: 'Seul un administrateur peut modifier un compte.' },
      { status: 403 },
    );
  }

  // 3. Alors seulement la clé qui contourne la RLS.
  const { error: souci } = await supabaseAdmin().rpc('modifier_compte', {
    emetteur: user.id,
    cible: lu.data.id,
    role_vise: lu.data.role,
    loge_visee: lu.data.loge_id,
  });

  if (souci) {
    const refus = refusDeLaBase(souci.code);
    if (refus.statut === 400) console.error('[comptes] modification refusée', souci);
    return NextResponse.json({ erreur: refus.erreur }, { status: refus.statut });
  }

  return NextResponse.json({ ok: true });
}
