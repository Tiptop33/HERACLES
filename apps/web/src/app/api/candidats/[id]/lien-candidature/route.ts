import { NextResponse } from 'next/server';
import { z } from 'zod';
import { envoyerCourriel } from '@/lib/courriel';
import { origine, retourAvecCode, vientDUnFormulaire } from '@/lib/formulaire';
import { empreinte, fabriquerJeton } from '@/lib/invitation';
import { courrielAuCandidat, lienDuCandidat } from '@/lib/parrainage';
import { lireModeles } from '@/lib/parrainage-serveur';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Renvoyer au candidat le lien vers sa fiche — le bouton « Renvoyer le
 * formulaire Candidat » du tableau de bord de Bubble.
 *
 * Un nouveau jeton remplace l'ancien (migration 0057) : le lien égaré cesse de
 * valoir. Si le courriel ne part pas, le lien est rendu au référent — en
 * réponse à `fetch` seulement, jamais dans une adresse de redirection.
 */

const RETOUR = '/espace/candidats/nouveau';

export async function POST(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const natif = vientDUnFormulaire(requete);

  const refuser = (code: string, message: string, statut = 400) =>
    natif
      ? retourAvecCode(requete, RETOUR, { erreur: code })
      : NextResponse.json({ erreur: message }, { status: statut });

  if (!z.uuid().safeParse(id).success) return refuser('introuvable', 'Dossier introuvable.', 404);

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return refuser('session', 'Session expirée.', 401);

  const jeton = fabriquerJeton();
  const { data, error } = await supabase.rpc('renvoyer_le_lien_du_candidat', {
    le_candidat: id,
    empreinte: empreinte(jeton),
  });

  if (error) {
    if (error.code === '42501') return refuser('sans-loge', 'Votre compte n’est rattaché à aucune loge.', 403);
    console.error('[lien-candidature] renvoi refusé', error.code);
    return refuser('echec', 'Le lien n’a pas pu être renouvelé.');
  }

  const dossier = data as { email: string; prenom: string | null; loge_nom: string | null } | null;
  if (!dossier) return refuser('introuvable', 'Ce dossier n’attend plus de réponse.', 404);

  const lien = lienDuCandidat(origine(requete), jeton);
  const message = courrielAuCandidat(await lireModeles(), lien, dossier.loge_nom, dossier.prenom ?? '');
  const issue = await envoyerCourriel({
    a: dossier.email,
    sujet: message.sujet,
    texte: message.texte,
    nomExpediteur: dossier.loge_nom,
    repondreA: user.email ?? null,
  });

  if (natif) {
    return retourAvecCode(requete, RETOUR, issue.envoye ? { renvoye: '1' } : { erreur: 'non-envoye' });
  }

  return issue.envoye
    ? NextResponse.json({ ok: true, envoye: true })
    : NextResponse.json({ ok: true, envoye: false, lien });
}
