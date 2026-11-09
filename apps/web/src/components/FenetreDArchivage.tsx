import Link from 'next/link';
import type { DossierAArchiver } from '@/lib/accueil';
import { jourEntier } from '@/lib/documents/formats';
import { nomComplet } from '@/lib/format';

/**
 * La fenêtre de l'accueil qui propose d'archiver les dossiers clôturés depuis
 * plus de deux mois (migration 0071) — au Vénérable Maître et au Secrétaire
 * seuls : la base ne rend la liste qu'à eux.
 *
 * Une seule fenêtre pour tous les dossiers concernés, chacun avec ses deux
 * boutons :
 *
 *   · « Archiver » — c'est fait, daté du jour ;
 *   · « Pas encore » — la question revient dans un mois, et ainsi de suite
 *     jusqu'à ce que l'archivage soit confirmé.
 *
 * « Fermer » ne tranche rien : la fenêtre revient au prochain passage sur
 * l'accueil, tant qu'un dossier attend.
 */
export default function FenetreDArchivage({
  dossiers,
  refus,
}: {
  dossiers: DossierAArchiver[];
  refus: string | null;
}) {
  const un = dossiers.length === 1;

  return (
    <div className="fenetre-fond">
      <Link
        href="/espace/accueil?fenetre=fermee"
        scroll={false}
        className="fenetre-voile"
        aria-label="Fermer sans rien trancher"
      />

      <div
        className="fenetre fenetre--large"
        role="dialog"
        aria-modal="true"
        aria-labelledby="archivage-titre"
      >
        <h2 id="archivage-titre">
          {un ? 'Archiver ce dossier clôturé ?' : `Archiver ces ${dossiers.length} dossiers clôturés ?`}
        </h2>
        <p>
          {un ? 'Il est clôturé' : 'Ils sont clôturés'} depuis plus de deux mois. « Pas encore » repose
          la question dans un mois.
        </p>

        {refus && (
          <p className="erreur" role="alert">
            {refus}
          </p>
        )}

        <ul className="archivage-liste">
          {dossiers.map((d) => (
            <li key={d.candidat_id}>
              <span className="archivage-dossier">
                <strong>
                  {d.numero !== null ? `N° ${d.numero} · ` : ''}
                  {nomComplet(d.prenom, d.nom) || 'Sans nom'}
                </strong>
                <small>
                  Clôturé le {d.estime ? '≈ ' : ''}
                  {jourEntier(d.clos_le) || '—'}
                  {d.cloture ? ` · ${d.cloture.replace(/[\s,]+$/, '')}` : ''}
                </small>
              </span>
              <span className="archivage-gestes">
                <form method="post" action={`/api/candidats/${d.candidat_id}/archivage`}>
                  <input type="hidden" name="decision" value="pas-encore" />
                  <button className="bouton bouton--petit" type="submit">
                    Pas encore
                  </button>
                </form>
                <form method="post" action={`/api/candidats/${d.candidat_id}/archivage`}>
                  <input type="hidden" name="decision" value="archiver" />
                  <button className="bouton bouton--fort bouton--petit" type="submit">
                    Archiver
                  </button>
                </form>
              </span>
            </li>
          ))}
        </ul>

        <div className="fenetre-gestes">
          <Link href="/espace/accueil?fenetre=fermee" scroll={false} className="bouton">
            Fermer
          </Link>
          <span className="aide">La fenêtre reviendra à votre prochain passage sur l’accueil.</span>
        </div>
      </div>
    </div>
  );
}
