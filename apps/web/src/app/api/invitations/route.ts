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
