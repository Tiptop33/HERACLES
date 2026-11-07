import { NextResponse } from 'next/server';
import { envoyerCourriel } from '@/lib/courriel';
import { lireCorps, origine, retourAvecCode, vientDUnFormulaire } from '@/lib/formulaire';
import { empreinte, fabriquerJeton } from '@/lib/invitation';
import {
  InvitationParrain,
  courrielAuParrain,
  lienDuParrain,
  premiereErreur,
} from '@/lib/parrainage';
import { lireModeles } from '@/lib/parrainage-serveur';
import { referentCourant } from '@/lib/candidat';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Inviter un parrain à présenter un candidat — le premier temps du parcours
 * de Bubble (migration 0057).
 *
 * L'ordre du projet :
 *
 *   1. la session ;
 *   2. le droit — `inviter_un_parrain()` exige une fiche de référent et une
 *      loge, et range l'invitation dans CETTE loge ;
 *   3. le courriel, enfin.
 *
 * Le jeton n'existe que dans le lien : la base n'en reçoit que l'empreinte.
 *
 * Quand le courriel ne part pas — Brevo non configuré, refus, panne —,
 * l'invitation existe quand même, et le lien est rendu à la personne qui
 * l'a demandé, pour qu'elle le transmette elle-même. Seulement en réponse à
 * `fetch` : un lien secret n'a rien à faire dans une adresse de redirection,
 * qui se garde dans l'historique.
 */

const RETOUR = '/espace/candidats/nouveau';

export async function POST(requete: Request) {
  try {
    return await traiter(requete);
  } catch (souci) {
    console.error('[parrainages] échec inattendu', souci);
    return NextResponse.json(
      { erreur: 'Le service est momentanément indisponible. Réessayez dans un instant.' },
      { status: 503 },
    );
  }
}

async function traiter(requete: Request) {
  const natif = vientDUnFormulaire(requete);

  const refuser = (code: string, message: string, statut = 400) =>
    natif
      ? retourAvecCode(requete, RETOUR, { erreur: code })
      : NextResponse.json({ erreur: message }, { status: statut });

  const lu = InvitationParrain.safeParse(await lireCorps(requete));
  if (!lu.success) return refuser('adresse', premiereErreur(lu.error).message);

  // 1. La session.
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return refuser('session', 'Session expirée.', 401);

  // 2. Le droit, et l'invitation — en un seul geste, côté base.
  const jeton = fabriquerJeton();
  const { error } = await supabase.rpc('inviter_un_parrain', {
    adresse: lu.data.email,
    empreinte: empreinte(jeton),
  });

  if (error) {
    if (error.code === '42501') {
      return refuser('sans-loge', 'Votre compte n’est rattaché à aucune loge.', 403);
    }
    if (error.code === '22023') {
      return refuser('adresse', 'Cette adresse e-mail n’est pas valide.');
    }
    console.error('[parrainages] invitation refusée', error.code);
    return refuser('echec', 'L’invitation n’a pas pu être créée.');
  }

  // 3. Le courriel. Signé du référent et de sa loge, comme chez Bubble, et la
  //    réponse lui revient.
  const [moi, modeles] = await Promise.all([referentCourant(), lireModeles()]);
  const nomDuReferent = [moi?.prenom, moi?.nom].filter(Boolean).join(' ') || null;
  const lien = lienDuParrain(origine(requete), jeton);
  const message = courrielAuParrain(modeles, lien, moi?.loge ?? null, nomDuReferent);

  const issue = await envoyerCourriel({
    a: lu.data.email,
    sujet: message.sujet,
    texte: message.texte,
    nomExpediteur: moi?.loge ?? null,
    repondreA: user.email ?? null,
  });

  if (natif) {
    return retourAvecCode(requete, RETOUR, issue.envoye ? { envoye: '1' } : { erreur: 'non-envoye' });
  }

  return issue.envoye
    ? NextResponse.json({ ok: true, envoye: true })
    : NextResponse.json({ ok: true, envoye: false, lien });
}
