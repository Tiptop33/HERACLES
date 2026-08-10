import { NextResponse } from 'next/server';
import { formatDImage, typeDeFichier } from '@/lib/fichiers';
import { retourAvecCode, vientDUnFormulaire } from '@/lib/formulaire';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * **Ma** photo : la déposer, ou la retirer, depuis « Mon compte ».
 *
 * Le pendant de `/api/referents/<id>/photo`, à une différence près qui fait
 * tout : **aucun identifiant ne circule**. Les fonctions de la migration 0050
 * n'en prennent pas — elles agissent sur `referent_courant()`, donc sur soi.
 * Il n'y a rien à contrôler ici parce qu'il n'y a rien à choisir, et c'est la
 * façon la plus sûre de ne pas se tromper de fiche.
 *
 * L'ordre imposé par le projet, comme ailleurs :
 *
 *   1. la session — `supabaseServer()` porte celle de la personne connectée ;
 *   2. le droit métier — `ma_photo()` (0047) dit s'il y a seulement une fiche
 *      de référent à laquelle accrocher un visage ;
 *   3. alors seulement `supabaseAdmin()`, pour écrire dans le seau.
 *
 * Ce que le fichier est se lit dans ses octets et jamais dans son nom : celui-ci
 * vient du navigateur. L'extension du fichier rangé est celle du format
 * reconnu — ce qui sera annoncé plus tard par `typeDeFichier()` est donc ce qui
 * a été vérifié ici.
 */

/** Cinq mégaoctets : large pour un portrait, trop peu pour servir de dépôt. */
const TAILLE_MAXIMALE = 5 * 1024 * 1024;

export async function POST(requete: Request) {
  try {
    return await traiter(requete);
  } catch (souci) {
    console.error('[profil/photo] échec inattendu', souci);
    return NextResponse.json(
      { erreur: 'Le service est momentanément indisponible. Réessayez dans un instant.' },
      { status: 503 },
    );
  }
}

async function traiter(requete: Request) {
  const natif = vientDUnFormulaire(requete);

  const refuser = (code: string, message: string, statut = 400) => {
    if (natif) return retourAvecCode(requete, '/mon-compte', { erreur: code });
    return NextResponse.json({ erreur: message }, { status: statut });
  };

  const champs = await requete.formData().catch(() => null);

  // 1. La session.
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return refuser('session', 'Session expirée.', 401);

  // 2. Ai-je seulement une fiche de référent ? Les fonctions de 0050 le
  //    redemanderont — ceci ne sert qu'à ne rien remuer dans le seau pour
  //    quelqu'un qui allait être refusé.
  const { data: lu } = await supabase.rpc('ma_photo');
  const mienne = ((lu as { referent_id: string; a_une_photo: boolean }[]) ?? [])[0];
  if (!mienne) {
    return refuser(
      'photo-sans-fiche',
      'Votre compte n’est rattaché à aucune fiche de référent.',
      403,
    );
  }

  // 3. Le seau, enfin — et pas avant.
  const stockage = supabaseAdmin().storage.from('documents');

  // Deux gestes à la même adresse : un champ caché dit lequel. Retirer
  // d'abord, parce qu'il n'attend aucun fichier.
  if (champs?.get('geste') === 'retirer') {
    const { data: retiree, error } = await supabase.rpc('retirer_ma_photo');

    if (error) {
      console.error('[profil/photo] retrait refusé', error);
      return refuser('photo-echec', 'Le retrait de la photo a échoué.', 400);
    }

    // Le visage quitte le stockage. Le laisser après qu'on a demandé de
    // l'enlever ne serait pas un oubli de ménage.
    if (typeof retiree === 'string') {
      const { error: souciMenage } = await stockage.remove([retiree]);
      if (souciMenage) console.error('[profil/photo] fichier non effacé', souciMenage);
    }

    return repondre(requete, natif);
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

  // Le chemin se déduit de ma fiche, et `poser_ma_photo()` n'accepte que
  // celui-là : rien de ce qui a été envoyé n'entre dans le nom du fichier.
  const chemin = `referent/photo/${mienne.referent_id}.${format}`;

  const { error: souciDepot } = await stockage.upload(chemin, octets, {
    contentType: typeDeFichier(chemin),
    // Redéposer écrase : c'est le même portrait, à la même place.
    upsert: true,
  });
  if (souciDepot) {
    console.error('[profil/photo] dépôt refusé', souciDepot);
    return refuser('photo-echec', 'Le dépôt de l’image a échoué.', 502);
  }

  // C'est la base qui tranche, pour de bon : si elle refuse, les octets
  // déposés à l'instant n'ont plus rien à faire dans le seau.
  const { data: ancien, error } = await supabase.rpc('poser_ma_photo', { chemin });

  if (error) {
    await stockage.remove([chemin]).catch(() => undefined);
    console.error('[profil/photo] enregistrement refusé', error);
    return refuser('photo-echec', 'Le dépôt de l’image a échoué.', 400);
  }

  // La photo remplacée quitte le seau. Seulement si elle porte un autre nom —
  // un JPEG remplacé par un JPEG occupe le même chemin, et l'effacer
  // reviendrait à supprimer celle qu'on vient de déposer.
  if (typeof ancien === 'string' && ancien !== chemin) {
    const { error: souciMenage } = await stockage.remove([ancien]);
    if (souciMenage) console.error('[profil/photo] ancienne photo non effacée', souciMenage);
  }

  return repondre(requete, natif);
}

/**
 * La réponse, commune aux deux gestes.
 *
 * `maj` fait redemander la photo au navigateur, qui la garde cinq minutes :
 * sans lui, celle qu'on vient de déposer resterait invisible sur l'écran même
 * où on l'a déposée. Ici et non au rendu de la page — une valeur qui change à
 * chaque affichage y serait interdite, et à raison.
 */
function repondre(requete: Request, natif: boolean) {
  const grain = String(Date.now());

  if (natif) return retourAvecCode(requete, '/mon-compte', { maj: grain });
  return NextResponse.json({ ok: true, maj: grain });
}
