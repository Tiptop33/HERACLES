import { supabaseServer } from './supabase-server';

/**
 * L'annuaire des référents.
 *
 * La lecture passe par une fonction de la base (migration 0012) plutôt que par
 * la table : la carte affiche le nombre de candidats accompagnés, qui suppose
 * de compter des fiches que l'appelant n'a pas le droit de lire. Et la
 * fonction ne rend que ce que la carte montre — ni grade, ni immatriculation,
 * ni dernière visite.
 */

export type FicheAnnuaire = {
  id: string;
  nom: string | null;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
  photo_url: string | null;
  college: string | null;
  loge_id: string | null;
  loge_nom: string | null;
  compte_rattache: boolean;
  /** La fiche de la personne connectée. C'est d'elle que vient sa loge. */
  c_est_moi: boolean;
  /** Une photo rapatriée de Bubble, servie par /espace/referents/<id>/photo. */
  a_une_photo: boolean;
  candidats_suivis: number;
};

/** Les deux valeurs d'adresse qui ne sont pas l'identifiant d'une loge. */
export const TOUTES_LES_LOGES = 'toutes';
export const SANS_LOGE = 'sans';

export type ChoixDeLoge = { valeur: string; nom: string };

export async function listerAnnuaire(): Promise<FicheAnnuaire[]> {
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc('annuaire_referents');
  return (data as FicheAnnuaire[]) ?? [];
}

/** Une fiche de l'annuaire, ou `null` — pour l'écran de modification. */
export async function lireFicheAnnuaire(id: string): Promise<FicheAnnuaire | null> {
  const fiches = await listerAnnuaire();
  return fiches.find((f) => f.id === id) ?? null;
}

/**
 * Les loges présentes dans l'annuaire, dans l'ordre alphabétique, suivies —
 * s'il y en a — de l'entrée « sans loge ».
 *
 * Ces douze-là ne sont pas un détail d'affichage : la reprise Bubble a laissé
 * douze référents sans rattachement, et un référent sans loge ne voit rien
 * dans HERACLES. Il faut pouvoir les retrouver pour les rattacher.
 */
export function logesDeLAnnuaire(fiches: FicheAnnuaire[]): ChoixDeLoge[] {
  const loges = new Map<string, string>();
  let orphelines = false;

  for (const f of fiches) {
    if (f.loge_id) loges.set(f.loge_id, f.loge_nom ?? 'Loge sans nom');
    else orphelines = true;
  }

  const liste = [...loges.entries()]
    .map(([valeur, nom]) => ({ valeur, nom }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

  return orphelines ? [...liste, { valeur: SANS_LOGE, nom: 'Sans loge' }] : liste;
}

/**
 * La loge sur laquelle la page s'ouvre : celle de la personne connectée.
 *
 * Un référent n'a de toute façon que la sienne. Un administrateur les a
 * toutes, mais il travaille dans une loge lui aussi — il commence par elle, et
 * va voir ailleurs s'il le veut. Faute de fiche de référent — un compte
 * d'administration pur —, il n'y a rien à deviner : on montre tout.
 */
export function logeDOuverture(fiches: FicheAnnuaire[]): string {
  return fiches.find((f) => f.c_est_moi)?.loge_id ?? TOUTES_LES_LOGES;
}

/**
 * La loge retenue, entre ce que demande l'adresse et ce que l'annuaire
 * contient. Une loge inconnue — adresse recopiée, fiche déplacée depuis —
 * ne vide pas l'écran : elle ramène à toutes.
 */
export function choisirLoge(fiches: FicheAnnuaire[], demande: string): string {
  const voulue = demande.trim() || logeDOuverture(fiches);
  const possibles = logesDeLAnnuaire(fiches).map((l) => l.valeur);
  return possibles.includes(voulue) ? voulue : TOUTES_LES_LOGES;
}

export function filtrerParLoge(fiches: FicheAnnuaire[], choix: string): FicheAnnuaire[] {
  if (choix === TOUTES_LES_LOGES) return fiches;
  if (choix === SANS_LOGE) return fiches.filter((f) => !f.loge_id);
  return fiches.filter((f) => f.loge_id === choix);
}

/**
 * Filtre à la volée, sur ce qui est déjà affiché. La liste tient dans une page
 * — soixante-dix personnes au plus —, il n'y a rien à demander au serveur.
 */
export function filtrerAnnuaire(fiches: FicheAnnuaire[], recherche: string): FicheAnnuaire[] {
  const mots = recherche.trim().toLowerCase();
  if (!mots) return fiches;

  // Un numéro se cherche comme il vient : « 06 12 34 » comme « 0612 34 ». On
  // compare les chiffres aux chiffres, sans quoi la façon dont Bubble a
  // enregistré le numéro déciderait de la façon dont on a le droit de le
  // chercher.
  const chiffres = mots.replace(/\D/g, '');

  return fiches.filter((f) => {
    const texte = [f.nom, f.prenom, f.email, f.telephone, f.loge_nom, f.college]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (texte.includes(mots)) return true;
    if (chiffres.length < 2) return false;

    return (f.telephone ?? '').replace(/\D/g, '').includes(chiffres);
  });
}

/** « 23 membres · 4 sans compte », ou le vide quand la loge est vide. */
export function resumeDeLAnnuaire(fiches: FicheAnnuaire[]): string {
  if (fiches.length === 0) return 'personne pour l’instant';

  const sansCompte = fiches.filter((f) => !f.compte_rattache).length;
  const membres = `${fiches.length} membre${fiches.length > 1 ? 's' : ''}`;

  return sansCompte === 0
    ? membres
    : `${membres} · ${sansCompte} sans compte`;
}
