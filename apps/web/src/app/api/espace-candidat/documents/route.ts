import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { formatDeDocument, typeDeFichier } from '@/lib/fichiers';
import {
  COLONNES_DU_DOCUMENT,
  DOCUMENTS_PAR_GENRE,
  TAILLE_MAXIMALE_DU_DOCUMENT,
  cheminDUnDocument,
  estGenreDeDocument,
  lireDocuments,
  nomDepuisLeFichier,
} from '@/lib/page-candidat';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { exigerMonDossier, refus, refusDeLaBase } from '../commun';

/**
 * Déposer un CV ou une lettre de motivation (0105).
 *
 *   1. la session et le dossier ;
 *   2. le fichier : sa taille, et son format lu dans ses octets — jamais dans
 *      son nom ;
 *   3. le seau, sous un nom que la route fixe ;
 *   4. la base, qui refuse tout chemin hors du dossier et le sixième
 *      document. Si elle refuse, le fichier repart du seau.
 */
export async function POST(requete: Request) {
  const session = await exigerMonDossier();
  if (session instanceof NextResponse) return session;

  const champs = await requete.formData().catch(() => null);
  if (!champs) return refus(400, 'Le formulaire est illisible.');

  const genre = champs.get('genre');
  if (!estGenreDeDocument(genre)) return refus(400, 'Genre de document inconnu.');

  const fichier = champs.get('fichier');
  if (!(fichier instanceof File) || fichier.size === 0) return refus(400, 'Choisissez un fichier.', genre);
  if (fichier.size > TAILLE_MAXIMALE_DU_DOCUMENT) return refus(413, 'Ce fichier dépasse 10 Mo.', genre);

  // Le plafond, vu d'ici : épargne un dépôt que la base refuserait.
  const { count } = await session.supabase
    .from('candidat_document')
    .select('id', { count: 'exact', head: true })
    .eq('candidat_id', session.dossier)
    .eq('genre', genre);
  if ((count ?? 0) >= DOCUMENTS_PAR_GENRE) {
    return refus(409, 'Cinq au plus : supprimez-en un pour en ajouter un autre.', genre);
  }

  const octets = new Uint8Array(await fichier.arrayBuffer());
  const format = formatDeDocument(octets);
  if (!format) {
    return refus(415, 'Ce fichier n’est pas reconnu : PDF, Word, OpenDocument, RTF, JPEG, PNG ou WebP.', genre);
  }

  const chemin = cheminDUnDocument(session.dossier, randomUUID(), format);
  const stockage = supabaseAdmin().storage.from('documents');
  const { error: refusDuSeau } = await stockage.upload(chemin, octets, {
    contentType: typeDeFichier(chemin),
    upsert: false,
  });
  if (refusDuSeau) {
    console.error('[page-candidat] dépôt refusé par le seau');
    return refus(502, 'Le dépôt a échoué. Réessayez.', genre);
  }

  const { data: id, error } = await session.supabase.rpc('deposer_mon_document', {
    le_genre: genre,
    le_nom: nomDepuisLeFichier(fichier.name),
    le_chemin: chemin,
    le_format: format,
    la_taille: fichier.size,
  });
  if (error || typeof id !== 'string') {
    await stockage.remove([chemin]).catch(() => undefined);
    return refusDeLaBase(error?.code, 'document refusé', genre);
  }

  const { data } = await session.supabase.from('candidat_document').select(COLONNES_DU_DOCUMENT).eq('id', id);
  return NextResponse.json({ document: lireDocuments(data ?? [])[0] ?? null });
}
