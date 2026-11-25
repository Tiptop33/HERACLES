import { NextResponse } from 'next/server';
import { formatDeDocument } from '@/lib/fichiers';
import { empreinte } from '@/lib/invitation';
import { TAILLE_MAXIMALE_PHOTO, estLisible } from '@/lib/lecture-cv';
import { lireLeCv } from '@/lib/lecture-cv-serveur';
import { TAILLE_MAXIMALE_DOCUMENT } from '@/lib/parrainage';
import { lireCandidature } from '@/lib/parrainage-serveur';

/**
 * Lire le CV que le candidat vient de choisir, pour pré-remplir sa fiche.
 *
 * Rien n'est enregistré ici : le CV est lu, et la route rend ce qu'elle y a
 * trouvé. Il sera joint à la fiche à l'envoi, par la route habituelle.
 *
 * Comme pour la fiche, **le lien est le droit** :
 *
 *   1. le jeton — désigne-t-il un dossier, et vaut-il encore ? ;
 *   2. une limite de lectures par lien : chaque lecture se paie ;
 *   3. le fichier — sa taille, et son format lu dans ses octets ;
 *   4. alors seulement, la lecture.
 *
 * Toutes les réponses sont en JSON : sans script, il n'y a pas de lecture, et
 * le formulaire s'envoie comme avant.
 *
 * Chaque sortie laisse une ligne « [lecture-cv] sortie … » au journal : le
 * statut, le motif, la durée, et le format du fichier quand il est connu. Le
 * 25 novembre 2026, une panne n'a pas pu être située parce qu'une lecture
 * réussie, un refus et une requête jamais arrivée laissaient le même journal
 * vide. La ligne ne porte ni jeton, ni nom de fichier, ni contenu.
 */

/** Cinq lectures par lien et par quart d'heure : de quoi changer d'avis sur son fichier. */
const LECTURES_PAR_FENETRE = 5;
const FENETRE = 15 * 60 * 1000;

/**
 * Les lectures récentes, par empreinte de jeton. En mémoire : un serveur
 * redémarré repart de zéro, ce qui est sans gravité — la limite protège la
 * facture d'un abus, pas un secret.
 */
const lectures = new Map<string, number[]>();

function lectureAutorisee(cle: string, maintenant = Date.now()): boolean {
  const recentes = (lectures.get(cle) ?? []).filter((t) => maintenant - t < FENETRE);
  if (recentes.length >= LECTURES_PAR_FENETRE) {
    lectures.set(cle, recentes);
    return false;
  }
  recentes.push(maintenant);
  lectures.set(cle, recentes);

  // Le ménage : un lien qu'on n'a plus servi depuis un quart d'heure s'oublie.
  if (lectures.size > 1000) {
    for (const [autre, temps] of lectures) {
      if (temps.every((t) => maintenant - t >= FENETRE)) lectures.delete(autre);
    }
  }
  return true;
}

/** La ligne de journal d'une sortie : jamais de jeton, de nom de fichier ni de contenu. */
function noter(statut: number, motif: string, debut: number, format?: string) {
  const ligne = `[lecture-cv] sortie ${statut} ${motif}${format ? ` format=${format}` : ''} ${Date.now() - debut} ms`;
  if (statut >= 500) console.error(ligne);
  else if (statut >= 400) console.warn(ligne);
  else console.info(ligne);
}

const A_LA_MAIN = 'Remplissez le formulaire vous-même : votre CV sera bien joint à votre fiche.';

export async function POST(requete: Request, { params }: { params: Promise<{ jeton: string }> }) {
  const debut = Date.now();
  let format: string | undefined;
  const refuser = (message: string, statut: number, motif: string) => {
    noter(statut, motif, debut, format);
    return NextResponse.json({ erreur: message }, { status: statut });
  };

  try {
    const { jeton } = await params;

    // 1. Le jeton.
    const candidature = await lireCandidature(jeton);
    if (!candidature || !candidature.valable) return refuser('Ce lien ne vaut plus.', 410, 'lien');

    // 2. La limite.
    if (!lectureAutorisee(empreinte(jeton))) {
      return refuser(`Vous avez déjà fait lire plusieurs CV. ${A_LA_MAIN}`, 429, 'limite');
    }

    // 3. Le fichier.
    const champs = await requete.formData().catch(() => null);
    const fichier = champs?.get('cv');
    if (!(fichier instanceof File) || fichier.size === 0) return refuser('Choisissez votre CV.', 400, 'sans-fichier');
    if (fichier.size > TAILLE_MAXIMALE_DOCUMENT) return refuser('Ce fichier dépasse 10 Mo.', 413, 'taille');

    const octets = new Uint8Array(await fichier.arrayBuffer());
    const reconnu = formatDeDocument(octets);
    format = reconnu ?? undefined;
    if (!reconnu) {
      return refuser(
        'Ce fichier n’est pas reconnu : PDF, Word, OpenDocument, RTF, JPEG, PNG ou WebP.',
        415,
        'format-inconnu',
      );
    }
    if (!estLisible(reconnu)) {
      return refuser(`Ce format ne se lit pas automatiquement. ${A_LA_MAIN}`, 415, 'format-non-lu');
    }
    if ((reconnu === 'jpg' || reconnu === 'png' || reconnu === 'webp') && octets.length > TAILLE_MAXIMALE_PHOTO) {
      return refuser(`Cette photo est trop lourde pour être lue (5 Mo au plus). ${A_LA_MAIN}`, 413, 'photo-trop-lourde');
    }

    // 4. La lecture.
    const issue = await lireLeCv(octets, reconnu);
    if (issue.ok) {
      noter(200, 'lu', debut, format);
      return NextResponse.json({ extrait: issue.extrait, photo: issue.photo });
    }

    if (issue.raison === 'indisponible') {
      return refuser(`La lecture automatique n’est pas disponible. ${A_LA_MAIN}`, 503, 'cle-absente');
    }
    if (issue.raison === 'illisible') {
      return refuser(`Votre CV n’a pas pu être lu. ${A_LA_MAIN}`, 422, 'illisible');
    }
    // Même message pour le candidat, qui n'y peut rien ; le journal, lui, nomme la cause.
    if (issue.raison === 'limite-de-depense') {
      return refuser(`La lecture de votre CV n’a pas abouti. ${A_LA_MAIN}`, 502, 'limite-de-depense');
    }
    return refuser(`La lecture de votre CV n’a pas abouti. ${A_LA_MAIN}`, 502, 'echec-lecture');
  } catch (souci) {
    console.error('[lecture-cv] échec inattendu', souci instanceof Error ? souci.name : 'inconnu');
    return refuser(`La lecture de votre CV n’a pas abouti. ${A_LA_MAIN}`, 503, 'inattendu');
  }
}
