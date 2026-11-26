import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { empreinte, fabriquerJeton } from '@/lib/invitation';

/**
 * Émettre une invitation. **Réservé aux administrateurs.**
 *
 * Le contrôle du rôle est fait deux fois, et ce n'est pas un oubli : ici, pour
 * répondre proprement, et dans `emettre_invitation` côté base, qui refuse quoi
 * qu'il arrive. Une route peut être contournée ; une fonction SQL non.
 */

const Formulaire = z.object({
  email: z.email("L'adresse e-mail n'est pas valide."),
  role: z.enum(['referent', 'chercheur', 'admin']).default('referent'),
  loge_id: z.uuid().nullable().optional(),
});

export async function POST(requete: Request) {
  try {
    return await traiter(requete);
  } catch (souci) {
    // Sans cela, une exception renvoie du HTML là où le navigateur attend du
    // JSON, et l'écran annonce une panne de réseau pour une panne de serveur.
    console.error('[invitations] échec inattendu', souci);
    return NextResponse.json(
      { erreur: 'Le service est momentanément indisponible. Réessayez dans un instant.' },
      { status: 503 },
    );
  }
}

async function traiter(requete: Request) {
  const brut = await requete.json().catch(() => null);
  const lu = Formulaire.safeParse(brut);

  if (!lu.success) {
    return NextResponse.json(
      { erreur: lu.error.issues[0]?.message ?? 'Formulaire invalide.' },
      { status: 400 },
    );
  }

  // 1. La session.
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ erreur: 'Session expirée.' }, { status: 401 });
  }

  // 2. Le droit métier. La RLS ne laisse lire que son propre profil.
  const { data: profil } = await supabase.from('profil').select('role').single();
  if (profil?.role !== 'admin') {
    return NextResponse.json(
      { erreur: 'Seul un administrateur peut inviter.' },
      { status: 403 },
    );
  }

  // 3. Alors seulement la clé qui contourne la RLS.
  const jeton = fabriquerJeton();
  const admin = supabaseAdmin();

  const { data: identifiant, error: souci } = await admin.rpc('emettre_invitation', {
    emetteur: user.id,
    adresse: lu.data.email,
    role_vise: lu.data.role,
    loge: lu.data.loge_id ?? null,
    empreinte: empreinte(jeton),
  });

  if (souci) {
    const dejaLa = souci.code === '23505' || souci.message?.includes('déjà un compte');
    return NextResponse.json(
      {
        erreur: dejaLa
          ? 'Cette adresse a déjà un compte.'
          : "L'invitation n'a pas pu être émise.",
      },
      { status: dejaLa ? 409 : 400 },
    );
  }

  // Le lien mène droit à l'invitation. Nul besoin d'ouvrir une session en
  // chemin : c'est le jeton qui identifie, et l'écran s'ouvre sur sa seule foi.
  const racine = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const lien = `${racine}/invitation/${jeton}`;

  // Supabase envoie le courriel et ouvre la session au clic : la personne
  // arrive sur l'écran d'invitation déjà identifiée, sans mot de passe encore.
  const { error: souciEnvoi } = await admin.auth.admin.inviteUserByEmail(lu.data.email, {
    redirectTo: lien,
  });

  if (souciEnvoi) {
    // L'invitation existe mais personne ne la recevra : on la révoque plutôt
    // que de laisser un lien vivant que nul ne connaît.
    await admin.rpc('refuser_invitation', { empreinte: empreinte(jeton) });
    return NextResponse.json(
      { erreur: "L'e-mail d'invitation n'a pas pu partir." },
      { status: 502 },
    );
  }

  // Le lien n'est jamais renvoyé au navigateur : il ne doit exister que dans la
  // boîte mail de la personne invitée.
  return NextResponse.json({ ok: true, id: identifiant });
}

/**
 * Corriger une invitation, **quel que soit son état**. Réservé aux
 * administrateurs. Deux corrections, envoyées séparément par l'écran :
 *
 *   * le rôle et la loge (`modifier_invitation`, migration 0108) — sur une
 *     invitation acceptée, c'est le compte qui change, et sa fiche référent ;
 *   * l'adresse :
 *       - invitation pas encore acceptée : un nouveau lien part à la nouvelle
 *         adresse, l'ancien cesse de valoir (`readresser_invitation`), et le
 *         compte vide que l'ancien envoi avait créé est retiré s'il n'a jamais
 *         servi ;
 *       - invitation acceptée : l'adresse de connexion du compte change chez
 *         l'authentification, puis l'invitation et la fiche suivent
 *         (`noter_adresse_du_compte`).
 *
 * Même ordre que pour émettre : la session, le droit métier, puis seulement la
 * clé service_role. Les fonctions refont le contrôle côté base.
 */

const Modification = z.union([
  z.object({
    id: z.uuid("L'invitation n'est pas reconnue."),
    role: z.enum(['referent', 'chercheur', 'admin'], { message: "Ce rôle n'existe pas." }),
    loge_id: z.uuid('Cette loge n’est pas reconnue.').nullable(),
  }),
  z.object({
    id: z.uuid("L'invitation n'est pas reconnue."),
    email: z.string().trim().pipe(z.email("L'adresse e-mail n'est pas valide.")),
  }),
]);

export async function PATCH(requete: Request) {
  try {
    return await modifier(requete);
  } catch (souci) {
    console.error('[invitations] échec inattendu de la modification', souci);
    return NextResponse.json(
      { erreur: 'Le service est momentanément indisponible. Réessayez dans un instant.' },
      { status: 503 },
    );
  }
}

/** Ce que la base répond, traduit pour la personne qui a modifié. */
function refusDeLaBase(code: string | undefined): { erreur: string; statut: number } {
  switch (code) {
    case 'P0002':
      return { erreur: "Cette invitation n'existe plus.", statut: 404 };
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
    case '23505':
      return { erreur: 'Cette adresse a déjà un compte.', statut: 409 };
    case '42501':
      return { erreur: 'Seul un administrateur peut modifier une invitation.', statut: 403 };
    default:
      return { erreur: "L'invitation n'a pas pu être modifiée.", statut: 400 };
  }
}

function refuser(erreur: string, statut: number) {
  return NextResponse.json({ erreur }, { status: statut });
}

async function modifier(requete: Request) {
  const brut = await requete.json().catch(() => null);
  const lu = Modification.safeParse(brut);
  if (!lu.success) {
    return refuser(lu.error.issues[0]?.message ?? 'Modification invalide.', 400);
  }

  // 1. La session.
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return refuser('Session expirée.', 401);

  // 2. Le droit métier.
  const { data: profil } = await supabase.from('profil').select('role').single();
  if (profil?.role !== 'admin') {
    return refuser('Seul un administrateur peut modifier une invitation.', 403);
  }

  // 3. La clé qui contourne la RLS.
  const admin = supabaseAdmin();

  if ('email' in lu.data) return changerAdresse(admin, user.id, lu.data.id, lu.data.email);

  const { error: souci } = await admin.rpc('modifier_invitation', {
    emetteur: user.id,
    cible: lu.data.id,
    role_vise: lu.data.role,
    loge_visee: lu.data.loge_id,
  });

  if (souci) {
    const refus = refusDeLaBase(souci.code);
    if (refus.statut === 400) console.error('[invitations] modification refusée', souci);
    return refuser(refus.erreur, refus.statut);
  }

  return NextResponse.json({ ok: true });
}

async function changerAdresse(
  admin: ReturnType<typeof supabaseAdmin>,
  emetteur: string,
  id: string,
  adresseBrute: string,
) {
  const adresse = adresseBrute.toLowerCase();

  const { data: invitation } = await admin
    .from('invitation')
    .select('email, etat, profil_id')
    .eq('id', id)
    .maybeSingle();
  if (!invitation) return refuser("Cette invitation n'existe plus.", 404);

  // Rien à faire : l'écran n'envoie que ce qui change, mais une requête à la
  // main ne doit pas renvoyer un courriel pour autant.
  if (invitation.email.toLowerCase() === adresse) return NextResponse.json({ ok: true });

  // — Acceptée : c'est l'adresse de connexion du compte qui change.
  if (invitation.etat === 'acceptee') {
    if (!invitation.profil_id) return refuser("Le compte de cette invitation n'existe plus.", 404);

    // `email_confirm` : l'administrateur fait foi, aucun courriel de
    // confirmation ne part. Le mot de passe ne change pas.
    const { error: souciCompte } = await admin.auth.admin.updateUserById(invitation.profil_id, {
      email: adresse,
      email_confirm: true,
    });
    if (souciCompte) {
      const prise = souciCompte.code === 'email_exists' || souciCompte.status === 422;
      if (!prise) console.error('[invitations] adresse de connexion refusée', souciCompte);
      return refuser(
        prise ? 'Cette adresse a déjà un compte.' : "L'adresse de connexion n'a pas pu changer.",
        prise ? 409 : 400,
      );
    }

    const { error: souci } = await admin.rpc('noter_adresse_du_compte', {
      emetteur,
      cible: id,
      adresse,
    });
    if (souci) {
      // On remet l'ancienne adresse : mieux vaut une correction refusée qu'un
      // compte qui se connecte sous une adresse que le tableau ne montre pas.
      await admin.auth.admin.updateUserById(invitation.profil_id, {
        email: invitation.email,
        email_confirm: true,
      });
      console.error('[invitations] adresse du compte non reportée', souci);
      const refus = refusDeLaBase(souci.code);
      return refuser(refus.erreur, refus.statut);
    }

    return NextResponse.json({ ok: true });
  }

  // — Pas encore acceptée : un nouveau lien part à la nouvelle adresse.
  const jeton = fabriquerJeton();
  const { data: ancienCompte, error: souci } = await admin.rpc('readresser_invitation', {
    emetteur,
    cible: id,
    adresse,
    empreinte: empreinte(jeton),
  });
  if (souci) {
    const refus = refusDeLaBase(souci.code);
    if (refus.statut === 400) console.error('[invitations] nouvelle adresse refusée', souci);
    return refuser(refus.erreur, refus.statut);
  }

  const racine = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const { error: souciEnvoi } = await admin.auth.admin.inviteUserByEmail(adresse, {
    redirectTo: `${racine}/invitation/${jeton}`,
  });
  if (souciEnvoi) {
    // Comme à l'émission : pas de lien vivant que nul ne connaît.
    await admin.rpc('refuser_invitation', { empreinte: empreinte(jeton) });
    console.error('[invitations] courriel vers la nouvelle adresse non parti', souciEnvoi);
    return refuser(
      "L'adresse est changée, mais l'e-mail n'a pas pu partir : l'invitation est révoquée. Corrigez de nouveau l'adresse pour la renvoyer.",
      502,
    );
  }

  // Le compte vide laissé par l'ancien envoi : la base l'a désigné parce que
  // rien ne le relie ; on vérifie en plus qu'il n'a jamais servi.
  if (typeof ancienCompte === 'string') {
    const { data: lu } = await admin.auth.admin.getUserById(ancienCompte);
    const jamaisServi = lu?.user && !lu.user.email_confirmed_at && !lu.user.last_sign_in_at;
    if (jamaisServi) {
      const { error: souciRetrait } = await admin.auth.admin.deleteUser(ancienCompte);
      if (souciRetrait) console.error('[invitations] compte vide non retiré', souciRetrait);
    }
  }

  return NextResponse.json({ ok: true });
}
