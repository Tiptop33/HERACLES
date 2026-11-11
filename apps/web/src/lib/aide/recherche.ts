import type { Parcours } from './parcours';

/**
 * Comprendre la question, sans rien envoyer nulle part.
 *
 * La question est découpée en mots, débarrassée de ses accents et de ses mots
 * creux (« comment », « puis-je », « la »…), puis comparée au titre et aux
 * mots-clés de chaque parcours. Tout se passe dans le navigateur : un nom de
 * candidat tapé par mégarde dans la question ne quitte pas l'écran.
 *
 * C'est volontairement simple. Quand une formulation échappe à la recherche,
 * la fenêtre d'aide montre la liste entière — on n'est jamais sans réponse.
 */

/** Les mots qui ne disent rien de ce qu'on cherche. */
const MOTS_CREUX = new Set([
  'a', 'ai', 'au', 'aux', 'avec', 'avoir', 'ca', 'ce', 'ces', 'cet', 'cette', 'comment', 'd',
  'dans', 'de', 'des', 'dois', 'doit', 'du', 'elle', 'en', 'est', 'et', 'faire', 'fait', 'faut',
  'il', 'j', 'je', 'l', 'la', 'le', 'les', 'm', 'me', 'moi', 'n', 'on', 'ou', 'par', 'pour',
  'peut', 'peux', 'puis', 'qu', 'que', 'quel', 'quelle', 'qui', 'quoi', 's', 'se', 'sont', 'suis',
  'sur', 'un', 'une', 'veux', 'voudrais', 'y', 'svp', 'merci', 'bonjour', 'aide', 'heracles',
]);

/** Minuscules, sans accents, sans ponctuation : « Clôturés ? » devient « clotures ». */
export function normaliser(texte: string): string {
  return texte
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * La racine d'un mot, à gros traits : on retire le pluriel et les terminaisons
 * courantes, pour que « archivés », « archiver » et « archive » se rejoignent.
 */
function racine(mot: string): string {
  if (mot.length <= 3) return mot;
  const sansFin = mot.replace(/(ees|es|ee|er|ez|e|s|x)$/, '');
  return sansFin.length >= 3 ? sansFin : mot;
}

/** Les mots utiles d'un texte, réduits à leur racine. */
export function motsUtiles(texte: string): string[] {
  return normaliser(texte)
    .split(' ')
    .filter((m) => m && !MOTS_CREUX.has(m))
    .map(racine);
}

/** « Mes » ne compte que collé à « candidats » : seul, il est dans toutes les questions. */
const POIDS_FAIBLE = new Set(['mes', 'mon', 'ma', 'candidat']);

function note(question: readonly string[], parcours: Parcours): number {
  const titre = new Set(motsUtiles(parcours.titre));
  const cles = new Set(parcours.motsCles.flatMap(motsUtiles));

  let total = 0;
  for (const mot of question) {
    const poids = POIDS_FAIBLE.has(mot) ? 1 : 3;
    if (cles.has(mot) || titre.has(mot)) {
      total += poids;
      continue;
    }
    // Un début de mot suffit (« archiv » pour « archivage »), à partir de
    // quatre lettres — en deçà, tout ressemble à tout.
    if (mot.length >= 4) {
      const proche = [...cles, ...titre].some(
        (c) => c.length >= 4 && (c.startsWith(mot) || mot.startsWith(c)),
      );
      if (proche) total += poids - 1;
    }
  }

  // Une expression entière retrouvée telle quelle (« compte rendu », « mes
  // candidats ») l'emporte sur des mots épars.
  const phrase = ` ${question.join(' ')} `;
  for (const cle of parcours.motsCles) {
    const mots = motsUtiles(cle);
    if (mots.length > 1 && phrase.includes(` ${mots.join(' ')} `)) total += 4;
  }

  return total;
}

/**
 * Les parcours qui répondent à la question, le meilleur d'abord.
 *
 * Une question vide ou faite de mots creux ne trouve rien : c'est à l'appelant
 * de montrer alors la liste entière.
 */
export function chercherDesParcours(
  question: string,
  parmi: readonly Parcours[],
  combien = 4,
): Parcours[] {
  const mots = motsUtiles(question);
  if (mots.length === 0) return [];

  return parmi
    .map((parcours, rang) => ({ parcours, rang, note: note(mots, parcours) }))
    .filter((r) => r.note >= 2)
    .sort((a, b) => b.note - a.note || a.rang - b.rang)
    .slice(0, combien)
    .map((r) => r.parcours);
}
