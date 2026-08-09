import { Coche, FlecheRetour } from '@/components/Icones';
import { A_FAIRE, TERMINEE, tacheOuverte, type LigneDeJournal } from '@/lib/journal';

/**
 * L'état d'une tâche, et de quoi le changer.
 *
 * Deux composants et non un seul : l'état se lit en tête de ligne, avec la
 * date et la nature, tandis que le geste qui le change se range avec les
 * autres gestes, à droite. Ce que l'on lit d'un côté, ce que l'on fait de
 * l'autre.
 *
 * Une tâche doit se refermer là où on la lit, sinon elle ne se referme
 * jamais.
 */

type Tache = Pick<LigneDeJournal, 'id' | 'etat' | 'etat_par_nom' | 'je_peux_agir'>;

/** Le mot qui dit où en est la tâche. Une note ordinaire n'en porte pas. */
export default function EtatDeTache({ ligne }: { ligne: Tache }) {
  if (!ligne.etat) return null;

  return (
    <span
      className={`etat ${tacheOuverte(ligne.etat) ? 'etat--attente' : 'etat--clos'}`}
      // Les tâches reprises de Bubble n'ont jamais été touchées ici : leur
      // état ne porte aucun nom, et il n'y a rien à dire de plus.
      title={ligne.etat_par_nom ? `Dernier changement : ${ligne.etat_par_nom}` : undefined}
    >
      {ligne.etat}
    </span>
  );
}

/**
 * Refermer la tâche, ou la rouvrir.
 *
 * C'est un `<form>` natif, et non un bouton piloté par JavaScript — le geste
 * marche pendant que la page charge, ce qui compte sur un téléphone dans un
 * couloir.
 *
 * Rien ici ne protège : `changer_etat_du_suivi()` (migration 0024) refuse
 * d'elle-même une tâche qu'on n'a pas le droit de voir. `je_peux_agir` évite
 * seulement d'afficher un bouton qui mènerait à un mur.
 */
export function GesteDeTache({
  ligne,
  retour,
}: {
  ligne: Tache;
  /** Où revenir : on referme sans quitter l'écran où l'on travaille. */
  retour: string;
}) {
  if (!ligne.etat || !ligne.je_peux_agir) return null;

  const ouverte = tacheOuverte(ligne.etat);

  return (
    <form method="post" action={`/api/suivi/${ligne.id}/etat`}>
      <input type="hidden" name="etat" value={ouverte ? TERMINEE : A_FAIRE} />
      <input type="hidden" name="retour" value={retour} />
      {/* Un seul dessin pour les deux sens : c'est la forme qui les sépare —
          la coche referme, la flèche revient en arrière. */}
      <button
        type="submit"
        className="geste geste--etat"
        aria-label={ouverte ? 'Terminer cette tâche' : 'Rouvrir cette tâche'}
        title={ouverte ? 'Terminer cette tâche' : 'Rouvrir cette tâche'}
      >
        {ouverte ? <Coche /> : <FlecheRetour />}
      </button>
    </form>
  );
}
