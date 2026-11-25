import { NextResponse } from 'next/server';
import { origine } from '@/lib/formulaire';
import { empreinte } from '@/lib/invitation';
import { ouvrirLaSessionDe } from '@/lib/page-candidat-serveur';
import { jeMeConnecte } from '@/lib/presence';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * Accepter l'invitation à la page candidat (0105).
 *
 * Le lien est le droit, comme pour la candidature : la personne n'a pas
 * encore de session. Dans l'ordre :
 *
 *   1. l'invitation — valable, et l'adresse de la fiche qu'elle désigne ;
 *   2. le compte de cette adresse — créé s'il n'existe pas, sans mot de
 *      passe ; refusé s'il est celui d'un référent ;
 *   3. la base relie le compte à la fiche et éteint le lien
 *      (`accepter_l_invitation_a_la_page`), qui ne sert qu'une fois ;
 *   4. la session s'ouvre, sans courriel de plus.
 *
 * C'est l'adresse **de la fiche** qui désigne le compte, jamais une adresse
 * saisie ici : celui qui ouvre le lien ne choisit pas qui il devient.
 */
export async function POST(_requete: Request, { params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  const racine = origine(_requete);
  const page = (refus: string) =>
    NextResponse.redirect(new URL(`/invitation-candidat/${jeton}?refus=${refus}`, racine), 303);

  if (!/^[A-Za-z0-9_-]{20,100}$/.test(jeton)) return page('echec');

  try {
    const admin = supabaseAdmin();
    const lEmpreinte = empreinte(jeton);

    // 1. L'invitation.
    const { data: lues } = await admin.rpc('invitation_a_la_page', { empreinte: lEmpreinte });
    const invitation = ((lues as { email: string | null; prenom: string | null; valable: boolean }[] | null) ?? [])[0];
    if (!invitation?.valable || !invitation.email) {
      return NextResponse.redirect(new URL(`/invitation-candidat/${jeton}`, racine), 303);
    }

    // 2. Le compte de cette adresse.
    const { data: comptes } = await admin.rpc('compte_pour_la_page', { adresse: invitation.email });
    const existant = ((comptes as { id: string; role: string | null; candidat_id: string | null }[] | null) ?? [])[0];
    let compte: string | null = existant?.id ?? null;

    // Un compte de candidat que rien ne relie encore à une fiche a pu être
    // ouvert par n'importe qui, avec un mot de passe à lui, avant que
    // l'inscription libre ne soit fermée : il est recréé à neuf, sans mot de
    // passe ni session. Ce compte ne porte rien d'autre que son profil.
    if (existant && existant.role === 'chercheur' && !existant.candidat_id) {
      const { error: souci } = await admin.auth.admin.deleteUser(existant.id);
      if (souci) {
        console.error('[invitation-candidat] compte orphelin non recréé', souci.status);
        return page('echec');
      }
      compte = null;
    }

    if (!compte) {
      const { data: cree, error } = await admin.auth.admin.createUser({
        email: invitation.email,
        email_confirm: true,
        user_metadata: { role: 'chercheur', prenom: invitation.prenom ?? '' },
      });
      if (error || !cree.user) {
        console.error('[invitation-candidat] compte non créé', error?.status);
        return page('echec');
      }
      compte = cree.user.id;
    }

    // 3. La base relie, et refuse ce qui ne doit pas l'être.
    const { data: acceptee, error: refus } = await admin.rpc('accepter_l_invitation_a_la_page', {
      empreinte: lEmpreinte,
      le_profil: compte,
    });
    if (refus) {
      if (refus.code === '42501') return page('referent');
      if (refus.code === '23505') return page('autre');
      if (refus.code === '28000') return NextResponse.redirect(new URL(`/invitation-candidat/${jeton}`, racine), 303);
      console.error('[invitation-candidat] lien refusé', refus.code);
      return page('echec');
    }

    // 4. La session — seulement quand l'invitation vient de relier le compte.
    //    Un compte déjà relié se connecte par un lien reçu à son adresse : un
    //    lien d'invitation qui circule ne donne pas le compte d'un candidat.
    const issue = ((acceptee as { candidat_id: string; deja_relie: boolean }[] | null) ?? [])[0];
    if (issue?.deja_relie) {
      return NextResponse.redirect(new URL('/connexion/lien?deja=1', racine), 303);
    }
    if (!(await ouvrirLaSessionDe(invitation.email))) {
      // Le compte est relié : un lien de connexion suffira.
      return NextResponse.redirect(new URL('/connexion/lien?erreur=lien', racine), 303);
    }
    await jeMeConnecte();
    return NextResponse.redirect(new URL('/espace/chercheur', racine), 303);
  } catch (souci) {
    console.error('[invitation-candidat] échec inattendu', (souci as Error).name);
    return page('echec');
  }
}
