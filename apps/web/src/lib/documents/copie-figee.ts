import { lireFiche } from '../poste';
import { supabaseAdmin } from '../supabase-admin';
import { supabaseServer } from '../supabase-server';
import { donneesDuCvAnonyme } from './cv-anonyme';
import { lireLEtatDuCvAnonyme } from './donnees';
import { produireLeCvAnonyme } from './produire';

/**
 * La copie figée du CV anonyme (migrations 0075, 0076) : le PDF d'une
 * validation, rangé dans le seau privé « documents ». Le lien public et « Voir
 * le CV anonyme » la servent ; à défaut, le PDF se produit à la volée.
 *
 * Elle se range :
 *
 *   · au clic « Valider » d'un référent (`figerLeCvAnonyme()`) ;
 *   · pour une validation de HERACLES (0076), qui n'a pas de clic, à la
 *     première ouverture du CV — par le lien public (`figerParLeJeton()`) ou
 *     par un référent de la loge depuis la fiche (`figerSousLaSession()`).
 *
 * Toujours dans cet ordre : le PDF est produit des données d'**une**
 * validation, puis la base fige **cette** validation-là si elle est toujours
 * en cours — sinon rien. Une copie ne peut donc pas se ranger sous une
 * validation dont elle n'a pas été produite.
 *
 * Le chemin vient **toujours de la base**, jamais de la requête, et il est
 * revérifié ici avant de toucher au seau avec la clé de service : seule la
 * forme qu'écrit la base passe.
 */

/** `candidats/<id du candidat>/cv-anonyme-valide-<millisecondes>.pdf` — la forme qu'écrivent 0075 et 0076. */
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

/** Ce que rend la base quand elle fige : où déposer, et quoi effacer. */
type Emplacement = { chemin: string | null; ancien: string | null };

/**
 * Déposer la copie au chemin que la base vient de donner, puis effacer celle
 * qu'elle remplace. Sous la clé de service : le seau n'a aucune policy.
 */
async function deposer(lieu: Emplacement, octets: Uint8Array, candidat?: string): Promise<boolean> {
  if (!estUneCopieFigee(lieu.chemin, candidat)) {
    console.error('[cv-anonyme] copie non figée : chemin inattendu');
    return false;
  }
  const seau = supabaseAdmin().storage.from('documents');
  const { error: souciDepot } = await seau.upload(lieu.chemin, octets, {
    contentType: 'application/pdf',
    upsert: false,
  });
  if (souciDepot) {
    console.error('[cv-anonyme] copie non figée : dépôt refusé', souciDepot.message);
    return false;
  }
  if (estUneCopieFigee(lieu.ancien, candidat)) {
    const { error: souciMenage } = await seau.remove([lieu.ancien]);
    if (souciMenage) console.error('[cv-anonyme] ancienne copie non effacée', souciMenage.message);
  }
  return true;
}

/**
 * Figer, sous la session d'un référent de la loge, la validation `valideLe`
 * dont `octets` est le PDF. `valideLe` est la valeur lue en base, telle
 * quelle : la comparaison se fait à la microseconde.
 *
 * Rend `false` sans lever si rien n'a été rangé — droit refusé, validation
 * changée entre-temps, seau indisponible. Le PDF reste servi à la volée.
 */
export async function figerSousLaSession(candidat: string, valideLe: string, octets: Uint8Array): Promise<boolean> {
  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.rpc('figer_cv_anonyme', {
      cible: candidat,
      valide_le_attendu: valideLe,
    });
    if (error) {
      console.error('[cv-anonyme] copie non figée : base refusée', error.code);
      return false;
    }
    const lieu = (data as Array<Emplacement & { issue: string }> | null)?.[0];
    if (lieu?.issue !== 'fige') {
      // `perimee` : la fiche a bougé depuis la lecture ; la suivante figera.
      if (lieu?.issue !== 'perimee') console.error('[cv-anonyme] copie non figée :', lieu?.issue ?? 'aucune réponse');
      return false;
    }
    return await deposer(lieu, octets, candidat);
  } catch (souci) {
    console.error('[cv-anonyme] copie non figée : échec inattendu', souci);
    return false;
  }
}

/**
 * Figer la validation qu'un référent vient de donner.
 *
 * **À n'appeler qu'après `valider_cv_anonyme()` rendu `valide`, sous la même
 * session.** La validation est relue, puis la fiche ; le PDF en est produit
 * — exactement ce que le lien public aurait produit —, et la base ne le fige
 * que si c'est toujours cette validation-là.
 */
export async function figerLeCvAnonyme(candidat: string): Promise<boolean> {
  try {
    const etat = await lireLEtatDuCvAnonyme(candidat);
    const fiche = etat?.valide_le ? await lireFiche(candidat) : null;
    if (!etat?.valide_le || !fiche) {
      console.error('[cv-anonyme] copie non figée : la validation a changé entre-temps');
      return false;
    }
    const octets = await produireLeCvAnonyme(donneesDuCvAnonyme(fiche, etat.valide_le));
    return await figerSousLaSession(candidat, etat.valide_le, octets);
  } catch (souci) {
    console.error('[cv-anonyme] copie non figée : échec inattendu', souci);
    return false;
  }
}

/**
 * Figer depuis le lien public la validation `valideLe` — celle qu'a rendue
 * `cv_anonyme_valide_public()` — dont `octets` est le PDF qu'on vient de
 * servir. La base ne fige que si cette validation est toujours en cours et
 * n'a pas encore de copie ; sinon, rien.
 */
export async function figerParLeJeton(jeton: string, valideLe: string, octets: Uint8Array): Promise<boolean> {
  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.rpc('figer_cv_anonyme_public', {
      jeton,
      valide_le_attendu: valideLe,
    });
    if (error) {
      console.error('[cv-anonyme] copie non figée : base refusée', error.code);
      return false;
    }
    const lieu = (data as Emplacement[] | null)?.[0];
    if (!lieu) return false;
    return await deposer(lieu, octets);
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
