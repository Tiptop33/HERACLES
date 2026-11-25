import { NextResponse } from 'next/server';
import { z } from 'zod';
import { envoyerCourriel } from '@/lib/courriel';
import { origine } from '@/lib/formulaire';
import { empreinte, fabriquerJeton } from '@/lib/invitation';
import { courrielDInvitationALaPage } from '@/lib/page-candidat';
import { lienDInvitation } from '@/lib/page-candidat-serveur';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Inviter le candidat à sa page — le bouton de la fiche (0105).
 *
 * La session du référent, puis la base : seuls le référent, le parrain et
 * l'administration invitent (`inviter_le_candidat_a_sa_page`). Une nouvelle
 * invitation remplace l'ancienne : le lien égaré cesse de valoir.
 *
 * Si le courriel ne part pas, le lien revient au référent, en réponse à
 * `fetch` seulement — jamais dans une adresse —, pour qu'il le transmette.
 * Seulement dans ce cas, et seulement pour un candidat dont l'espace n'est pas
 * encore ouvert : pour un compte déjà relié, le lien n'ouvre de toute façon
 * pas de session, et le candidat reçoit un lien de connexion à son adresse.
 */
export async function POST(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ erreur: 'Dossier introuvable.' }, { status: 404 });
  }

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erreur: 'Votre session a expiré. Reconnectez-vous.' }, { status: 401 });

  const jeton = fabriquerJeton();
  const { data, error } = await supabase.rpc('inviter_le_candidat_a_sa_page', {
    le_candidat: id,
    empreinte: empreinte(jeton),
  });

  if (error) {
    if (error.code === '42501') {
      return NextResponse.json({ erreur: 'Seuls son référent et son parrain invitent ce candidat.' }, { status: 403 });
    }
    if (error.code === 'P0002') {
      return NextResponse.json(
        { erreur: 'Sa fiche n’a pas d’adresse e-mail. Ajoutez-la, puis invitez-le.' },
        { status: 422 },
      );
    }
    console.error('[page-candidat] invitation refusée', error.code);
    return NextResponse.json({ erreur: 'L’invitation n’a pas pu partir. Réessayez.' }, { status: 503 });
  }

  const dossier = (
    (data as { email: string; prenom: string | null; loge_nom: string | null; a_deja_un_compte: boolean }[] | null) ?? []
  )[0];
  if (!dossier) return NextResponse.json({ erreur: 'Dossier introuvable.' }, { status: 404 });

  const lien = lienDInvitation(origine(requete), jeton);
  const issue = await envoyerCourriel({
    a: dossier.email,
    ...courrielDInvitationALaPage(dossier.prenom, lien),
    nomExpediteur: dossier.loge_nom,
    repondreA: user.email ?? null,
  });

  if (issue.envoye) return NextResponse.json({ ok: true, envoye: true, email: dossier.email });
  if (dossier.a_deja_un_compte) {
    return NextResponse.json({
      ok: true,
      envoye: false,
      email: dossier.email,
      deja_ouverte: true,
    });
  }
  return NextResponse.json({ ok: true, envoye: false, email: dossier.email, lien });
}
