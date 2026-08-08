import { A_FAIRE, TERMINEE, tacheOuverte, type LigneDeJournal } from '@/lib/journal';

/**
 * L'état d'une tâche, et de quoi le changer.
 *
 * Le même dessin sert dans la fiche et dans « Action / Candidat » : une tâche
 * doit se refermer là où on la lit, sinon elle ne se referme jamais. C'est un
 * `<form>` natif, et non un bouton piloté par JavaScript — le geste marche
 * pendant que la page charge, ce qui compte sur un téléphone dans un couloir.
 *
 * Rien ici ne protège : `changer_etat_du_suivi()` (migration 0024) refuse
 * d'elle-même une tâche qu'on n'a pas le droit de voir. `je_peux_agir` évite
 * seulement d'afficher un bouton qui mènerait à un mur.
 */
export default function EtatDeTache({
  ligne,
  retour,
}: {
  ligne: Pick<LigneDeJournal, 'id' | 'etat' | 'etat_par_nom' | 'je_peux_agir'>;
  /** Où revenir : on referme sans quitter l'écran où l'on travaille. */
  retour: string;
}) {
  if (!ligne.etat) return null;

  const ouverte = tacheOuverte(ligne.etat);

  return (
    <>
      <span
        className={`etat ${ouverte ? 'etat--attente' : 'etat--clos'}`}
        // Les tâches reprises de Bubble n'ont jamais été touchées ici : leur
        // état ne porte aucun nom, et il n'y a rien à dire de plus.
        title={ligne.etat_par_nom ? `Dernier changement : ${ligne.etat_par_nom}` : undefined}
      >
        {ligne.etat}
      </span>

      {ligne.je_peux_agir && (
        <form method="post" action={`/api/suivi/${ligne.id}/etat`} className="journal-agir">
          <input type="hidden" name="etat" value={ouverte ? TERMINEE : A_FAIRE} />
          <input type="hidden" name="retour" value={retour} />
          <button type="submit">{ouverte ? 'Terminer' : 'Rouvrir'}</button>
        </form>
      )}
    </>
  );
}
