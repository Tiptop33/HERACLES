import { NextResponse } from 'next/server';
import { InvitationCandidat, refusDInvitation } from '@/lib/espace-candidat';
import { empreinte, fabriquerJeton } from '@/lib/invitation';
import { premiereErreur } from '@/lib/parrainage';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Le bouton « Nouveau candidat » de l'administrateur. **Réservé aux
 * administrateurs.**
 *
 * Un seul geste ouvre le dossier et invite le candidat (migration 0060). Le
 * courriel part par Supabase, comme pour toute invitation (`/api/invitations`) :
 * au clic, le compte existe et l'écran d'invitation s'ouvre, où le candidat
 * choisit son mot de passe.
 *
 * Le droit est vérifié deux fois, ici pour répondre proprement, et dans
 * `inviter_un_candidat`, qui refuse quoi qu'il arrive.
 */
export async function POST(requete: Request) {
  try {
    return await traiter(requete);
  } catch (souci) {
    console.error('[candidats/inviter] échec inattendu', souci);
    return NextResponse.json(
      { erreur: 'Le service est momentanément indisponible. Réessayez dans un instant.' },
      { status: 503 },
    );
  }
}

async function traiter(requete: Request) {
  const brut = await requete.json().catch(() => null);
  const lu = InvitationCandidat.safeParse(brut);
  if (!lu.success) {
    const { champ, message } = premiereErreur(lu.error);
    return NextResponse.json({ erreur: message, champ }, { status: 400 });
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
      { erreur: 'Seul un administrateur peut ouvrir un dossier.' },
      { status: 403 },
    );
  }

  // 3. Alors seulement la clé qui contourne la RLS.
  const jeton = fabriquerJeton();
  const admin = supabaseAdmin();
  const { data: ouverture, error: souci } = await admin.rpc('inviter_un_candidat', {
    emetteur: user.id,
    adresse: lu.data.email,
    loge_choisie: lu.data.loge_id,
    parrain: {
      nom: lu.data.parrain_nom,
      prenom: lu.data.parrain_prenom,
      loge: lu.data.parrain_loge,
      email: lu.data.parrain_email,
    },
    empreinte: empreinte(jeton),
  });

  if (souci || !ouverture) {
    const { message, statut } = refusDInvitation(souci);
    return NextResponse.json({ erreur: message }, { status: statut });
  }

  const racine = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const { error: souciEnvoi } = await admin.auth.admin.inviteUserByEmail(lu.data.email, {
    redirectTo: `${racine}/invitation/${jeton}`,
  });

  if (souciEnvoi) {
    // L'invitation existe mais personne ne la recevra : on la révoque. Le
    // dossier, lui, reste ouvert — réinviter la même adresse le reprendra
    // plutôt que d'en ouvrir un second (0060).
    await admin.rpc('refuser_invitation', { empreinte: empreinte(jeton) });
    return NextResponse.json(
      { erreur: "Le dossier est ouvert, mais l'e-mail d'invitation n'a pas pu partir. Réessayez." },
      { status: 502 },
    );
  }

  // Le lien n'est jamais renvoyé au navigateur : il ne doit exister que dans la
  // boîte mail du candidat.
  const { numero, loge_nom } = ouverture as { numero: number; loge_nom: string | null };
  return NextResponse.json({ ok: true, numero, loge_nom });
}
