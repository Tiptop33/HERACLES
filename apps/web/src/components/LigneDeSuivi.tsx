import Link from 'next/link';
import EtatDeTache from '@/components/EtatDeTache';
import { dateEnLettres } from '@/lib/format';
import { NATURES, type LigneDeJournal } from '@/lib/journal';

/**
 * Une ligne du journal : ce qu'elle dit, et les gestes qu'on peut y faire.
 *
 * Le même composant sert dans la fiche et dans « Action / Candidat » — une
 * note doit se corriger là où on la lit, sinon on ne la corrige pas.
 *
 * **Corriger ouvre un formulaire par un lien, pas par un bouton qui déplie.**
 * C'est la convention des onglets de la fiche : ce qu'on ne regarde pas n'est
 * pas envoyé au navigateur, et l'adresse dit ce qui est ouvert — donc un
 * rafraîchissement ne referme pas ce qu'on était en train d'écrire.
 */
export default function LigneDeSuivi({
  ligne,
  retour,
  enCorrection,
  versCorrection,
  versLecture,
}: {
  ligne: LigneDeJournal;
  /** Où revenir après un geste : l'écran d'où l'on agit, vue comprise. */
  retour: string;
  /** Cette ligne est-elle ouverte en correction ? */
  enCorrection: boolean;
  /** L'adresse qui l'ouvre en correction. */
  versCorrection: string;
  /** L'adresse qui la referme sans rien changer. */
  versLecture: string;
}) {
  if (enCorrection) {
    return (
      <li className="journal-ligne">
        <form
          className="journal-ecrire"
          method="post"
          action={`/api/suivi/${ligne.id}/modifier`}
        >
          <input type="hidden" name="retour" value={versLecture} />
          <textarea
            name="texte"
            required
            maxLength={4000}
            rows={3}
            defaultValue={ligne.texte}
            aria-label="Corriger cette note"
          />

          <div className="journal-ecrire-pied">
            <input
              name="nature"
              list="natures-du-suivi"
              maxLength={120}
              defaultValue={ligne.nature ?? ''}
              placeholder="Appel, entretien…"
              aria-label="Nature"
              className="journal-nature"
            />
            <datalist id="natures-du-suivi">
              {NATURES.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>

            <input
              type="date"
              name="fait_le"
              defaultValue={ligne.fait_le}
              aria-label="Le jour où c’est arrivé"
              className="journal-date"
            />

            <button className="bouton bouton--fort" type="submit">
              Enregistrer
            </button>
            <Link className="bouton" href={versLecture}>
              Annuler
            </Link>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="journal-ligne">
      <div className="journal-ligne-tete">
        <time dateTime={ligne.fait_le}>{dateEnLettres(ligne.fait_le)}</time>
        {ligne.nature && <span className="etiquette">{ligne.nature}</span>}
        <EtatDeTache ligne={ligne} retour={retour} />
        <span className="journal-auteur">
          {ligne.c_est_moi ? 'vous' : (ligne.auteur_nom ?? 'auteur inconnu')}
          {/* Corriger la note d'un collègue est permis (0025) ; le taire ne
              le serait pas. On ne le dit que si quelqu'un l'a fait. */}
          {ligne.modifie_par_nom && ` · corrigé par ${ligne.modifie_par_nom}`}
        </span>

        {ligne.je_peux_agir && (
          <>
            <Link className="journal-agir-lien" href={versCorrection}>
              Modifier
            </Link>
            <form
              method="post"
              action={`/api/suivi/${ligne.id}/retirer`}
              className="journal-agir"
            >
              <input type="hidden" name="geste" value="retirer" />
              <input type="hidden" name="retour" value={retour} />
              {/* « Retirer » et non « Supprimer » : le mot dit ce qui se passe
                  vraiment — la ligne quitte l'écran, elle reste en base. */}
              <button type="submit" title="La note quitte le journal, sans être effacée">
                Retirer
              </button>
            </form>
          </>
        )}
      </div>
      <p className="prose">{ligne.texte}</p>
    </li>
  );
}
