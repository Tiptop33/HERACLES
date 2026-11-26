import { NextResponse } from 'next/server';
import { z } from 'zod';
import { empreinte, fabriquerJeton } from '@/lib/invitation';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Renvoyer le lien d'une invitation pas encore acceptée, à la même adresse.
 * **Réservé aux administrateurs.**
 *
 * Même ordre que pour émettre : la session, le droit métier, puis seulement la
 * clé service_role. `renouveler_invitation` (migration 0110) pose un nouveau
 * jeton valable sept jours — l'ancien lien cesse de valoir — et refait le
 * contrôle d'administrateur. Puis le courriel part.
 *
 * L'envoi précédent a créé un compte jamais ouvert pour cette adresse :
 * l'authentification de Supabase renvoie alors l'invitation à ce même compte,
 * et ne refuse qu'un compte déjà ouvert — que la base a écarté avant.
 */

const Renvoi = z.object({
  id: z.uuid("L'invitation n'est pas reconnue."),
});

function refuser(erreur: string, statut: number) {
  return NextResponse.json({ erreur }, { status: statut });
}

export async function POST(requete: Request) {
  try {
    return await renvoyer(requete);
  } catch (souci) {
    console.error('[invitations] échec inattendu du renvoi', souci);
    return refuser('Le service est momentanément indisponible. Réessayez dans un instant.', 503);
  }
}

async function renvoyer(requete: Request) {
  const lu = Renvoi.safeParse(await requete.json().catch(() => null));
  if (!lu.success) return refuser(lu.error.issues[0]?.message ?? 'Demande invalide.', 400);

  // 1. La session.
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return refuser('Session expirée.', 401);

  // 2. Le droit métier. La RLS ne laisse lire que son propre profil.
  const { data: profil } = await supabase.from('profil').select('role').single();
  if (profil?.role !== 'admin') {
    return refuser('Seul un administrateur peut renvoyer une invitation.', 403);
  }

  // 3. Alors seulement la clé qui contourne la RLS.
  const admin = supabaseAdmin();
  const { data: invitation } = await admin
    .from('invitation')
    .select('email')
    .eq('id', lu.data.id)
    .maybeSingle();
  if (!invitation) return refuser("Cette invitation n'existe plus.", 404);

  const jeton = fabriquerJeton();
  const { error: souci } = await admin.rpc('renouveler_invitation', {
    emetteur: user.id,
    cible: lu.data.id,
    empreinte: empreinte(jeton),
  });

  if (souci) {
    switch (souci.code) {
      case 'P0002':
        return refuser("Cette invitation n'existe plus.", 404);
      case '22023':
        return refuser('Cette invitation est acceptée : le compte se gère dans Admin › Comptes.', 409);
      case '23505':
        return refuser(
          'Cette adresse a déjà un compte ouvert : il se gère dans Admin › Comptes.',
          409,
        );
      case '42501':
        return refuser('Seul un administrateur peut renvoyer une invitation.', 403);
      default:
        console.error('[invitations] renvoi refusé', souci);
        return refuser("Le lien n'a pas pu être renvoyé.", 400);
    }
  }

  const racine = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const { error: souciEnvoi } = await admin.auth.admin.inviteUserByEmail(invitation.email, {
    redirectTo: `${racine}/invitation/${jeton}`,
  });

  if (souciEnvoi) {
    // Comme à l'émission : pas de lien vivant que nul ne connaît.
    await admin.rpc('refuser_invitation', { empreinte: empreinte(jeton) });
    console.error('[invitations] courriel du renvoi non parti', souciEnvoi);
    return refuser(
      "L'e-mail n'a pas pu partir : l'invitation est révoquée. Réessayez dans un instant.",
      502,
    );
  }

  // Le lien n'est jamais renvoyé au navigateur : il ne doit exister que dans
  // la boîte mail de la personne invitée.
  return NextResponse.json({ ok: true });
}
