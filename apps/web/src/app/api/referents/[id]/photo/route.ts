import { NextResponse } from 'next/server';
import { z } from 'zod';
import { formatDImage, typeDeFichier } from '@/lib/fichiers';
import { retourAvecCode, vientDUnFormulaire } from '@/lib/formulaire';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * La photo d'un référent : la déposer, ou la retirer. **Réservé aux
 * administrateurs.**
 *
 * Deux gestes à la même adresse, comme pour les réunions : un champ caché
 * `geste` dit lequel. Sans lui, on déposerait.
 *
 * L'ordre imposé par le projet, et il compte doublement ici puisque le fichier
 * part dans un seau que `service_role` ouvre en grand :
 *
 *   1. la session — `supabaseServer()` porte celle de la personne connectée ;
 *   2. le droit métier — `est_admin()` ; la base le redemandera de toute façon
 *      à l'écriture, mais le demander avant évite de déposer les octets de
 *      quelqu'un qui allait être refusé ;
 *   3. alors seulement `supabaseAdmin()`, pour écrire dans le seau.
 *
 * Ce que le fichier est, on le lit dans ses octets et jamais dans son nom :
 * celui-ci vient du navigateur. L'extension du fichier rangé est celle du
 * format reconnu — ce qui sera annoncé plus tard par `typeDeFichier()` est donc
 * ce qui a été vérifié ici.
 *
 * Le chemin, lui, n'est pas choisi par l'appelant : il se déduit de
 * l'identifiant de la fiche. Même déposée cent fois, une photo n'occupe qu'une
 * place, et `poser_la_photo_du_referent()` (migration 0048) refuserait de
 * toute façon un chemin d'ailleurs.
 *
 * Retirer efface le fichier du seau, et non seulement le chemin sur la fiche.
 * Un visage qui resterait dans le stockage après qu'on a demandé de l'enlever
 * ne serait pas un oubli de ménage.
 */

/** Cinq mégaoctets : large pour un portrait, trop peu pour servir de dépôt. */
const TAILLE_MAXIMALE = 5 * 1024 * 1024;

export async function POST(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return await traiter(requete, params);
  } catch (souci) {
    console.error('[referents/photo] échec inattendu', souci);
    return NextResponse.json(
      { erreur: 'Le service est momentanément indisponible. Réessayez dans un instant.' },
      { status: 503 },
    );
  }
}

async function traiter(requete: Request, params: Promise<{ id: string }>) {
  const { id } = await params;
  const natif = vientDUnFormulaire(requete);

  const refuser = (code: string, message: string, statut = 400) => {
    if (natif) return retourAvecCode(requete, `/espace/referents/${id}/modifier`, { erreur: code });
    return NextResponse.json({ erreur: message }, { status: statut });
  };

  if (!z.uuid().safeParse(id).success) return refuser('inconnu', 'Fiche inconnue.', 404);

  const champs = await requete.formData().catch(() => null);

  // 1. La session.
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return refuser('session', 'Session expirée.', 401);

  // 2. Le droit, dit par la base. Les fonctions de 0048 et 0049 le
  //    redemanderont — ceci ne sert qu'à ne rien remuer dans le seau pour
  //    quelqu'un qui allait être refusé.
  const { data: admin } = await supabase.rpc('est_admin');
  if (admin !== true) return refuser('refus', 'Cette fiche n’est pas modifiable.', 403);

  // 3. Le seau, enfin — et pas avant.
  const stockage = supabaseAdmin().storage.from('documents');

  // Deux gestes à la même adresse, comme pour les réunions : un champ caché
  // dit lequel. Retirer d'abord, parce qu'il n'attend aucun fichier.
  if (champs?.get('geste') === 'retirer') {
    const { data: retiree, error } = await supabase.rpc('retirer_la_photo_du_referent', {
      referent_choisi: id,
    });

    if (error) {
      console.error('[referents/photo] retrait refusé', error);
      return refuser('refus', 'Cette fiche n’est pas modifiable.', 403);
    }

    // Le visage quitte le stockage. Le laisser après qu'on a demandé de
    // l'enlever ne serait pas un oubli de ménage : ce sont des données
    // personnelles, et elles ne restent pas « au cas où ».
    if (typeof retiree === 'string') {
      const { error: souciMenage } = await stockage.remove([retiree]);
      if (souciMenage) console.error('[referents/photo] fichier non effacé', souciMenage);
    }

    return repondre(requete, natif, id);
  }

  const depose = champs?.get('photo');
  if (!(depose instanceof File) || depose.size === 0) {
    return refuser('photo-absente', 'Choisissez une image à déposer.');
  }

  if (depose.size > TAILLE_MAXIMALE) {
    return refuser('photo-taille', 'Cette image dépasse 5 Mo.', 413);
  }

  const octets = new Uint8Array(await depose.arrayBuffer());
  const format = formatDImage(octets);
  if (!format) {
    return refuser(
      'photo-format',
      'Ce fichier n’est pas une image reconnue : JPEG, PNG, WebP, GIF ou AVIF.',
      415,
    );
  }

  // Le chemin se déduit de la fiche : rien de ce que l'appelant a envoyé
  // n'entre dans le nom du fichier.
  const chemin = `referent/photo/${id}.${format}`;

  const { error: souciDepot } = await stockage.upload(chemin, octets, {
    contentType: typeDeFichier(chemin),
    // Redéposer écrase : c'est le même portrait, à la même place. Sans cela,
    // la seconde photo d'une même personne échouerait sur un fichier existant.
    upsert: true,
  });
  if (souciDepot) {
    console.error('[referents/photo] dépôt refusé', souciDepot);
    return refuser('photo-echec', 'Le dépôt de l’image a échoué.', 502);
  }

  // 4. Ranger le chemin sur la fiche. C'est la base qui tranche, une seconde
  //    fois et pour de bon : si elle refuse, les octets déposés à l'instant
  //    n'ont plus rien à faire dans le seau.
  const { data: ancien, error } = await supabase.rpc('poser_la_photo_du_referent', {
    referent_choisi: id,
    chemin,
  });

  if (error) {
    await stockage.remove([chemin]).catch(() => undefined);
    console.error('[referents/photo] enregistrement refusé', error);
    return refuser('refus', 'Cette fiche n’est pas modifiable.', 403);
  }

  // 5. La photo remplacée quitte le seau. Seulement si elle porte un autre nom
  //    — un JPEG remplacé par un JPEG occupe le même chemin, et l'effacer
  //    reviendrait à supprimer celle qu'on vient de déposer.
  if (typeof ancien === 'string' && ancien !== chemin) {
    const { error: souciMenage } = await stockage.remove([ancien]);
    // Un orphelin dans le seau n'est pas une raison de dire que le dépôt a
    // échoué : la photo est en place, et la fiche la désigne.
    if (souciMenage) console.error('[referents/photo] ancienne photo non effacée', souciMenage);
  }

  return repondre(requete, natif, id);
}

/**
 * La réponse, commune aux deux gestes.
 *
 * `maj` fait redemander la photo au navigateur, qui la garde cinq minutes :
 * sans lui, celle qu'on vient de déposer resterait invisible sur l'écran même
 * où on l'a déposée. Ici et non au rendu de la page — une valeur qui change à
 * chaque affichage y serait interdite, et à raison.
 */
function repondre(requete: Request, natif: boolean, id: string) {
  const grain = String(Date.now());

  if (natif) {
    return retourAvecCode(requete, `/espace/referents/${id}/modifier`, { maj: grain });
  }
  return NextResponse.json({ ok: true, maj: grain });
}
