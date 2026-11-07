import { NextResponse } from 'next/server';
import { envoyerCourriel } from '@/lib/courriel';
import { lireCorps, origine, retourAvecCode, vientDUnFormulaire } from '@/lib/formulaire';
import { empreinte, fabriquerJeton } from '@/lib/invitation';
import {
  FormulaireParrain,
  courrielAuCandidat,
  lienDuCandidat,
  premiereErreur,
} from '@/lib/parrainage';
import { lireModeles, lireParrainage } from '@/lib/parrainage-serveur';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * Le parrain présente le candidat — le deuxième temps du parcours.
 *
 * Le parrain n'a pas de compte : **son lien est son droit**. L'ordre est donc :
 *
 *   1. le jeton — sa ligne existe-t-elle, vaut-elle encore ? ;
 *   2. la saisie, validée ici puis de nouveau par la base ;
 *   3. alors seulement la clé service_role, pour ouvrir le dossier — dans la
 *      loge du référent qui a invité, jamais dans une autre ;
 *   4. le courriel au candidat, avec son propre lien.
 *
 * Si ce dernier courriel ne part pas, le dossier existe quand même : le
 * référent le verra « en attente du candidat » et pourra relancer. On ne dit
 * pas au parrain que l'envoi a échoué — il n'y peut rien.
 */

export async function POST(requete: Request, { params }: { params: Promise<{ jeton: string }> }) {
  try {
    const { jeton } = await params;
    return await traiter(requete, jeton);
  } catch (souci) {
    console.error('[parrainage] échec inattendu', souci);
    return NextResponse.json(
      { erreur: 'Le service est momentanément indisponible. Réessayez dans un instant.' },
      { status: 503 },
    );
  }
}

async function traiter(requete: Request, jeton: string) {
  const natif = vientDUnFormulaire(requete);
  const page = `/parrainage/${jeton}`;

  const refuser = (code: string, message: string, champ: string | null = null, statut = 400) =>
    natif
      ? retourAvecCode(requete, page, { erreur: code })
      : NextResponse.json({ erreur: message, champ }, { status: statut });

  // 1. Le jeton.
  const parrainage = await lireParrainage(jeton);
  if (!parrainage || !parrainage.valable) {
    return refuser('lien', 'Ce lien ne vaut plus.', null, 410);
  }

  // 2. La saisie.
  const lu = FormulaireParrain.safeParse(await lireCorps(requete));
  if (!lu.success) {
    const { champ, message } = premiereErreur(lu.error);
    return refuser('saisie', message, champ);
  }

  // 3. Le dossier s'ouvre.
  const jetonCandidat = fabriquerJeton();
  const { data, error } = await supabaseAdmin().rpc('presenter_un_candidat', {
    empreinte: empreinte(jeton),
    fiche: { ...lu.data, urgence: String(lu.data.urgence) },
    empreinte_candidat: empreinte(jetonCandidat),
  });

  if (error) {
    // 28000 : le lien a été servi entre la lecture et l'envoi — un double clic.
    if (error.code === '28000') return refuser('lien', 'Ce lien ne vaut plus.', null, 410);
    if (error.code === '23514') return refuser('saisie', 'Un champ est incomplet.');
    console.error('[parrainage] présentation refusée', error.code);
    return refuser('echec', 'La présentation n’a pas pu être enregistrée.');
  }

  const ouvert = data as { candidat_id: string; numero: number; loge_nom: string | null };

  // 4. Le courriel au candidat.
  const modeles = await lireModeles(true);
  const message = courrielAuCandidat(
    modeles,
    lienDuCandidat(origine(requete), jetonCandidat),
    ouvert.loge_nom,
    lu.data.candidat_prenom,
  );
  const issue = await envoyerCourriel({
    a: lu.data.candidat_email,
    sujet: message.sujet,
    texte: message.texte,
    nomExpediteur: ouvert.loge_nom,
  });
  if (!issue.envoye) {
    console.warn('[parrainage] le lien du candidat n’est pas parti', issue.raison);
  }

  if (natif) return retourAvecCode(requete, '/merci', { pour: 'parrain' });
  return NextResponse.json({ ok: true });
}
