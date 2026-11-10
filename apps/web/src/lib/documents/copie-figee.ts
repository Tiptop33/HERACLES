import { lireFiche } from '../poste';
import { supabaseAdmin } from '../supabase-admin';
import { supabaseServer } from '../supabase-server';
import { donneesDuCvAnonyme } from './cv-anonyme';
import { lireLEtatDuCvAnonyme } from './donnees';
import { produireLeCvAnonyme } from './produire';

/**
 * La copie figée du CV anonyme (migration 0075) : le PDF tel qu'il était au
 * moment où un référent l'a validé, rangé dans le seau privé « documents ».
 * Le lien public et « Voir le CV anonyme » la servent ; à défaut, le PDF se
 * produit à la volée, comme avant.
 *
 * Le chemin vient **toujours de la base** (`figer_cv_anonyme()`,
 * `copie_figee_du_cv_anonyme()`, `cv_anonyme_valide_public()`), jamais de la
 * requête. Il est en plus revérifié ici avant de toucher au seau avec la clé
 * de service : seule la forme qu'écrit la base passe.
 */

/** `candidats/<id du candidat>/cv-anonyme-valide-<millisecondes>.pdf` — la forme qu'écrit 0075. */
const CHEMIN = /^candidats\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/cv-anonyme-valide-\d{1,16}\.pdf$/i;

/**
 * Vrai si `chemin` a la forme d'une copie figée — et, si `candidat` est donné,
 * celle de ce candidat-là.
 */
export function estUneCopieFigee(chemin: unknown, candidat?: string): chemin is string {
  if (typeof chemin !== 'string') return false;
  const lu = CHEMIN.exec(chemin);
  if (!lu) return false;
  return candidat === undefined || lu[1].toLowerCase() === candidat.toLowerCase();
}

type Figee = { issue: string; chemin: string | null; ancien: string | null };

/**
 * Figer la validation qu'on vient de donner.
 *
 * **À n'appeler qu'après `valider_cv_anonyme()` rendu `valide`, sous la même
 * session.** L'ordre du projet est tenu :
 *
 *   1. `figer_cv_anonyme()`, sous la session, revérifie le droit (0074) et
 *      rend le chemin où déposer le PDF, et celui de la copie qu'il remplace ;
 *   2. le PDF se produit de la fiche lue sous la session, daté du jour de la
 *      validation — exactement ce que le lien public aurait produit ;
 *   3. le dépôt dans le seau, sous la clé de service : le seau n'a aucune
 *      policy, rien d'autre ne peut y écrire ;
 *   4. la copie remplacée quitte le seau.
 *
 * Rend `false` sans lever si la copie n'a pas pu être rangée : la validation,
 * elle, est acquise, et le PDF continue de se produire à la volée. Le journal
 * le dit.
 */
export async function figerLeCvAnonyme(candidat: string): Promise<boolean> {
  try {
    // 1. Le chemin, donné par la base.
    const supabase = await supabaseServer();
    const { data, error } = await supabase.rpc('figer_cv_anonyme', { cible: candidat });
    if (error) {
      console.error('[cv-anonyme] copie non figée : base refusée', error.code);
      return false;
    }
    const figee = (data as Figee[] | null)?.[0];
    if (figee?.issue !== 'fige' || !estUneCopieFigee(figee.chemin, candidat)) {
      console.error('[cv-anonyme] copie non figée :', figee?.issue ?? 'aucune réponse');
      return false;
    }

    // 2. Le PDF de cette validation.
    const [fiche, etat] = await Promise.all([lireFiche(candidat), lireLEtatDuCvAnonyme(candidat)]);
    if (!fiche || !etat?.valide_le) {
      // La fiche a bougé entre-temps : la validation est effacée, il n'y a
      // plus rien à figer.
      console.error('[cv-anonyme] copie non figée : la validation a changé entre-temps');
      return false;
    }
    const octets = await produireLeCvAnonyme(donneesDuCvAnonyme(fiche, etat.valide_le));

    // 3. Le seau.
    const seau = supabaseAdmin().storage.from('documents');
    const { error: souciDepot } = await seau.upload(figee.chemin, octets, {
      contentType: 'application/pdf',
      upsert: false,
    });
    if (souciDepot) {
      console.error('[cv-anonyme] copie non figée : dépôt refusé', souciDepot.message);
      return false;
    }

    // 4. La copie remplacée.
    if (estUneCopieFigee(figee.ancien, candidat)) {
      const { error: souciMenage } = await seau.remove([figee.ancien]);
      if (souciMenage) console.error('[cv-anonyme] ancienne copie non effacée', souciMenage.message);
    }

    return true;
  } catch (souci) {
    console.error('[cv-anonyme] copie non figée : échec inattendu', souci);
    return false;
  }
}

/**
 * Les octets d'une copie figée, ou `null` si elle manque.
 *
 * **Le chemin doit venir d'une fonction de la base qui a vérifié le droit** —
 * `copie_figee_du_cv_anonyme()` sous la session, ou
 * `cv_anonyme_valide_public()` pour qui détient le jeton.
 */
export async function lireLaCopieFigee(chemin: string): Promise<ArrayBuffer | null> {
  if (!estUneCopieFigee(chemin)) return null;
  try {
    const { data, error } = await supabaseAdmin().storage.from('documents').download(chemin);
    if (error || !data) {
      console.error('[cv-anonyme] copie figée illisible, PDF produit à la volée', error?.message);
      return null;
    }
    return await data.arrayBuffer();
  } catch (souci) {
    console.error('[cv-anonyme] copie figée illisible, PDF produit à la volée', souci);
    return null;
  }
}
