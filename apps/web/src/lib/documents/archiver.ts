import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '../supabase-admin';
import { supabaseServer } from '../supabase-server';
import type { Sorte } from './archives';

/**
 * Ranger l'exemplaire d'un PDF que la feuille d'appel vient de produire
 * (migration 0069).
 *
 * **À n'appeler qu'après avoir vérifié la session et la réunion** — les trois
 * routes le font avec `lireUneReunion()`, qui ne rend rien hors de sa loge.
 * L'ordre du projet est alors tenu :
 *
 *   1. la loge, lue sous la session (`ma_loge()`) — elle seule donne le
 *      dossier où ranger le fichier ;
 *   2. le dépôt dans le seau, sous la clé de service : le seau n'a aucune
 *      policy, rien d'autre ne peut y écrire ;
 *   3. la ligne en base, sous la session : `archiver_un_document()` revérifie
 *      la réunion, et n'accepte qu'un chemin de cette loge ;
 *   4. le fichier que l'exemplaire remplace quitte le seau.
 *
 * Le nom du fichier dans le seau est tiré au hasard : rien de ce qui vient de
 * la requête n'y entre.
 *
 * Rend `false` si l'archivage n'a pas abouti, sans lever : le PDF reste
 * servi. En séance, ne pas pouvoir imprimer le compte rendu parce que le seau
 * hoquette serait pire que de devoir le redemander. Le journal le dit.
 */
export async function archiverLeDocument(a: {
  reunion: string;
  sorte: Sorte;
  /** « Compte-Rendu du 28-10-2026 » — sans l'extension. */
  titre: string;
  octets: Uint8Array;
  /** Le dossier d'une affichette. */
  candidat?: string | null;
}): Promise<boolean> {
  const supabase = await supabaseServer();

  // 1. La loge.
  const { data: loge, error: souciLoge } = await supabase.rpc('ma_loge');
  if (souciLoge || typeof loge !== 'string' || !/^[0-9a-f-]{36}$/i.test(loge)) {
    console.error('[archives] loge introuvable, PDF non archivé', a.sorte, souciLoge?.code);
    return false;
  }

  // 2. Le seau.
  const chemin = `archives/${loge}/${randomUUID()}.pdf`;
  const seau = supabaseAdmin().storage.from('documents');
  const { error: souciDepot } = await seau.upload(chemin, a.octets, {
    contentType: 'application/pdf',
    upsert: false,
  });
  if (souciDepot) {
    console.error('[archives] dépôt refusé, PDF non archivé', a.sorte, souciDepot.message);
    return false;
  }

  // 3. La base.
  const { data: ancien, error: souciBase } = await supabase.rpc('archiver_un_document', {
    reunion_choisie: a.reunion,
    sorte: a.sorte,
    nom_choisi: a.titre,
    chemin_choisi: chemin,
    candidat_choisi: a.candidat ?? null,
  });
  if (souciBase) {
    console.error('[archives] base refusée, PDF non archivé', a.sorte, souciBase.code);
    // Le fichier n'a plus de ligne pour le retrouver : il ne reste pas.
    await seau.remove([chemin]);
    return false;
  }

  // 4. L'exemplaire remplacé.
  if (typeof ancien === 'string' && ancien) {
    const { error: souciMenage } = await seau.remove([ancien]);
    if (souciMenage) console.error('[archives] ancien exemplaire non effacé', souciMenage.message);
  }

  return true;
}
