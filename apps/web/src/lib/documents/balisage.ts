/**
 * Le petit balisage des textes de la mise en page.
 *
 * Les textes des trois documents se règlent dans Paramètres › Mise en page.
 * Il leur faut trois choses, et rien de plus :
 *
 *   · des **variables** entre accolades — `{commission}`, `{numero}` — que le
 *     document remplace par les données du jour ;
 *   · du **gras** entre deux paires d'astérisques — `**HERACLES**` ;
 *   · de l'*italique* entre deux astérisques — `*urgent*`.
 *
 * Un saut de ligne dans le texte est un saut de ligne dans le document.
 *
 * L'ORDRE COMPTE : D'ABORD LE BALISAGE, ENSUITE LES DONNÉES
 *
 * Le modèle est découpé en morceaux gras / italiques **avant** que les
 * variables soient remplacées. Une donnée qui contient des astérisques — un
 * intitulé saisi par un candidat, « Chef de projet **senior** » — reste donc
 * du texte : elle ne peut ni mettre le reste du document en gras, ni fermer
 * une balise ouverte par le modèle.
 *
 * Ce fichier ne sait rien de pdfmake : il rend des morceaux, que les gabarits
 * mettent en forme. Il sert aussi à l'écran des réglages.
 */

export type Morceau = {
  texte: string;
  gras: boolean;
  italique: boolean;
};

export type Variables = Readonly<Record<string, string | number | null | undefined>>;

const VARIABLE = /\{([a-z_]+)\}/g;

/** Découpe un modèle en morceaux gras / italiques. Les variables restent telles quelles. */
export function analyser(modele: string): Morceau[] {
  const morceaux: Morceau[] = [];
  let gras = false;
  let italique = false;
  let courant = '';

  const pousser = () => {
    if (courant) morceaux.push({ texte: courant, gras, italique });
    courant = '';
  };

  for (let i = 0; i < modele.length; i += 1) {
    if (modele.startsWith('**', i)) {
      pousser();
      gras = !gras;
      i += 1;
      continue;
    }
    if (modele[i] === '*') {
      pousser();
      italique = !italique;
      continue;
    }
    courant += modele[i];
  }
  pousser();

  // Fusionne les voisins de même style : « **a****b** » ne fait qu'un morceau.
  return morceaux.reduce<Morceau[]>((acc, m) => {
    const dernier = acc[acc.length - 1];
    if (dernier && dernier.gras === m.gras && dernier.italique === m.italique) {
      dernier.texte += m.texte;
    } else {
      acc.push({ ...m });
    }
    return acc;
  }, []);
}

function valeur(variables: Variables, nom: string): string | null {
  if (!Object.prototype.hasOwnProperty.call(variables, nom)) return null;
  const v = variables[nom];
  return v === null || v === undefined ? '' : String(v);
}

/**
 * Remplace les variables d'un texte. Une variable inconnue reste écrite telle
 * quelle : sur l'aperçu, `{comission}` mal orthographiée se voit et se corrige ;
 * une case vide passerait inaperçue.
 */
export function substituer(texte: string, variables: Variables): string {
  return texte.replace(VARIABLE, (tout, nom: string) => valeur(variables, nom) ?? tout);
}

/**
 * Les lignes dont **toutes** les variables sont vides disparaissent.
 *
 * Une ligne de contact « **{secretaire}**, Secrétariat… » sans secrétaire à la
 * loge ne doit pas s'imprimer en « **, Secrétariat… ». Une ligne sans aucune
 * variable reste, elle : c'est du texte voulu.
 */
export function retirerLesLignesVides(modele: string, variables: Variables): string {
  return modele
    .split('\n')
    .filter((ligne) => {
      const noms = [...ligne.matchAll(VARIABLE)].map((m) => m[1]);
      const connus = noms.filter((n) => valeur(variables, n) !== null);
      if (connus.length === 0) return true;
      return connus.some((n) => (valeur(variables, n) ?? '').trim() !== '');
    })
    .join('\n');
}

/** Le modèle, découpé puis rempli : ce qu'un gabarit met en page. */
export function remplir(modele: string, variables: Variables): Morceau[] {
  return analyser(retirerLesLignesVides(modele, variables))
    .map((m) => ({ ...m, texte: substituer(m.texte, variables) }))
    .filter((m) => m.texte !== '');
}

/** Le texte brut, sans balisage — pour un nom de fichier, un test, une infobulle. */
export function enClair(modele: string, variables: Variables): string {
  return remplir(modele, variables)
    .map((m) => m.texte)
    .join('');
}

/** Les variables qu'un modèle emploie — pour signaler celles que le document ignore. */
export function variablesEmployees(modele: string): string[] {
  return [...new Set([...modele.matchAll(VARIABLE)].map((m) => m[1]))];
}
