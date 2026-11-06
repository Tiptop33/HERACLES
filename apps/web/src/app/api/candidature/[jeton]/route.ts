import { NextResponse } from 'next/server';
import { formatDeDocument, typeDeFichier } from '@/lib/fichiers';
import { retourAvecCode, vientDUnFormulaire } from '@/lib/formulaire';
import { empreinte } from '@/lib/invitation';
import {
  FormulaireCandidature,
  TAILLE_MAXIMALE_DOCUMENT,
  cheminDuDocument,
  premiereErreur,
} from '@/lib/parrainage';
import { lireCandidature } from '@/lib/parrainage-serveur';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * Le candidat complète sa fiche — le troisième temps du parcours.
 *
 * Comme pour le parrain, **le lien est le droit** :
 *
 *   1. le jeton — désigne-t-il un dossier, et vaut-il encore ? ;
 *   2. la saisie, puis les fichiers : le CV est obligatoire, la lettre non.
 *      Leur format se lit dans leurs octets, jamais dans leur nom ;
 *   3. les fichiers vont au seau privé, sous un nom que la route fixe ;
 *   4. la base enregistre la fiche — et refuse tout chemin qui ne serait pas
 *      celui de CE dossier. Si elle refuse, les fichiers déposés repartent.
 */

type Depot = { genre: 'cv' | 'lettre'; octets: Uint8Array; format: string };

export async function POST(requete: Request, { params }: { params: Promise<{ jeton: string }> }) {
  try {
    const { jeton } = await params;
    return await traiter(requete, jeton);
  } catch (souci) {
    console.error('[candidature] échec inattendu', souci);
    return NextResponse.json(
      { erreur: 'Le service est momentanément indisponible. Réessayez dans un instant.' },
      { status: 503 },
    );
  }
}

async function traiter(requete: Request, jeton: string) {
  const natif = vientDUnFormulaire(requete) && !requete.headers.get('x-requested-with');
  const page = `/candidature/${jeton}`;

  const refuser = (code: string, message: string, champ: string | null = null, statut = 400) =>
    natif
      ? retourAvecCode(requete, page, { erreur: code })
      : NextResponse.json({ erreur: message, champ }, { status: statut });

  // 1. Le jeton.
  const candidature = await lireCandidature(jeton);
  if (!candidature || !candidature.valable) {
    return refuser('lien', 'Ce lien ne vaut plus.', null, 410);
  }

  const champs = await requete.formData().catch(() => null);
  if (!champs) return refuser('saisie', 'Le formulaire est illisible.');

  // 2. La saisie…
  const texte: Record<string, string> = {};
  for (const [cle, valeur] of champs.entries()) {
    if (typeof valeur === 'string') texte[cle] = valeur;
  }

  const lu = FormulaireCandidature.safeParse(texte);
  if (!lu.success) {
    const { champ, message } = premiereErreur(lu.error);
    return refuser('saisie', message, champ);
  }

  // … puis les fichiers.
  const depots: Depot[] = [];
  for (const genre of ['cv', 'lettre'] as const) {
    const fichier = champs.get(genre);
    const present = fichier instanceof File && fichier.size > 0;

    if (!present) {
      if (genre === 'cv') return refuser('cv', 'Joignez votre CV.', 'cv');
      continue;
    }

    if (fichier.size > TAILLE_MAXIMALE_DOCUMENT) {
      return refuser('taille', 'Un fichier dépasse 10 Mo.', genre, 413);
    }

    const octets = new Uint8Array(await fichier.arrayBuffer());
    const format = formatDeDocument(octets);
    if (!format) {
      return refuser(
        'format',
        'Ce fichier n’est pas reconnu : PDF, Word, OpenDocument, RTF, JPEG, PNG ou WebP.',
        genre,
        415,
      );
    }

    depots.push({ genre, octets, format });
  }

  // 3. Le seau — après le jeton, après la saisie, et pas avant.
  const admin = supabaseAdmin();
  const stockage = admin.storage.from('documents');
  const chemins: Partial<Record<'cv' | 'lettre', string>> = {};

  for (const depot of depots) {
    const chemin = cheminDuDocument(depot.genre, candidature.candidat_id, depot.format);
    const { error } = await stockage.upload(chemin, depot.octets, {
      contentType: typeDeFichier(chemin),
      upsert: true,
    });
    if (error) {
      console.error('[candidature] dépôt refusé', depot.genre);
      const deposes = Object.values(chemins);
      if (deposes.length > 0) await stockage.remove(deposes).catch(() => undefined);
      return refuser('echec', 'Le dépôt de vos fichiers a échoué. Réessayez.', null, 502);
    }
    chemins[depot.genre] = chemin;
  }

  // 4. La base tranche.
  const { error } = await admin.rpc('completer_sa_candidature', {
    empreinte: empreinte(jeton),
    fiche: { ...lu.data, age: String(lu.data.age) },
    cv: chemins.cv ?? null,
    lettre: chemins.lettre ?? null,
  });

  if (error) {
    await stockage.remove(Object.values(chemins)).catch(() => undefined);
    if (error.code === '28000') return refuser('lien', 'Ce lien ne vaut plus.', null, 410);
    console.error('[candidature] enregistrement refusé', error.code);
    return refuser('echec', 'Votre fiche n’a pas pu être enregistrée. Réessayez.');
  }

  if (natif) return retourAvecCode(requete, '/merci', { pour: 'candidat' });
  return NextResponse.json({ ok: true });
}
