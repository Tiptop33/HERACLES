import Link from 'next/link';
import { listerCollege } from '@/lib/college';
import { RUBRIQUES } from '@/lib/parametres';
import { Corbeille } from '@/components/Icones';

export const metadata = { title: 'Collège — Paramètres — HERACLES' };

/** Ce que les routes renvoient, dit à qui a cliqué. */
const REFUS: Record<string, string> = {
  vide: 'Un titre ne peut pas être vide.',
  doublon: 'Ce titre est déjà dans la liste.',
  droit: 'Seul un administrateur peut tenir cette liste.',
  absent: 'Ce titre n’existe plus.',
  session: 'Votre session a expiré. Reconnectez-vous.',
  formulaire: 'Ce geste n’a pas été compris.',
  echec: 'La liste n’a pas pu être modifiée.',
};

function premier(valeur: string | string[] | undefined): string {
  if (Array.isArray(valeur)) return valeur[0] ?? '';
  return valeur ?? '';
}

export default async function College({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string | string[]; supprimer?: string | string[] }>;
}) {
  const parametres = await searchParams;
  const titres = await listerCollege();

  const refus = REFUS[premier(parametres.erreur)] ?? null;
  const aRetirer = titres.find((t) => t.id === premier(parametres.supprimer)) ?? null;
  const propos = RUBRIQUES.find((r) => r.libelle === 'Collège')?.propos ?? '';

  return (
    <>
      <h2>Collège</h2>
      <p className="aide">{propos}</p>

      {refus && (
        <p className="erreur" role="alert">
          {refus}
        </p>
      )}

      {/* Ajouter d'abord : c'est le geste le plus fréquent sur une liste
          qu'on est en train de constituer. */}
      <form className="college-ajout" method="post" action="/api/parametres/college">
        <input
          name="nom"
          maxLength={120}
          required
          placeholder="Ajouter un titre — Orateur, Expert…"
          aria-label="Nouveau titre"
        />
        <button className="bouton bouton--fort" type="submit">
          Ajouter
        </button>
      </form>

      {titres.length === 0 ? (
        <p className="vide-liste">La liste est vide. Le champ « Collège » ne proposera rien.</p>
      ) : (
        <ol className="college-liste">
          {titres.map((titre, place) => (
            <li key={titre.id} className="college-ligne">
              {/* Ranger. Deux formulaires plutôt que deux liens : ranger
                  change la liste, et ce qui change ne se met pas dans une
                  adresse qu'un navigateur peut visiter tout seul. */}
              <span className="college-fleches">
                <form method="post" action={`/api/parametres/college/${titre.id}`}>
                  <input type="hidden" name="action" value="deplacer" />
                  <input type="hidden" name="vers" value="haut" />
                  <button
                    className="fleche"
                    type="submit"
                    disabled={place === 0}
                    aria-label={`Monter ${titre.nom}`}
                    title="Monter"
                  >
                    ↑
                  </button>
                </form>
                <form method="post" action={`/api/parametres/college/${titre.id}`}>
                  <input type="hidden" name="action" value="deplacer" />
                  <input type="hidden" name="vers" value="bas" />
                  <button
                    className="fleche"
                    type="submit"
                    disabled={place === titres.length - 1}
                    aria-label={`Descendre ${titre.nom}`}
                    title="Descendre"
                  >
                    ↓
                  </button>
                </form>
              </span>

              <form
                className="college-renommer"
                method="post"
                action={`/api/parametres/college/${titre.id}`}
              >
                <input type="hidden" name="action" value="renommer" />
                <input
                  name="nom"
                  defaultValue={titre.nom}
                  maxLength={120}
                  required
                  aria-label={`Titre : ${titre.nom}`}
                />
                <button className="bouton" type="submit">
                  Enregistrer
                </button>
              </form>

              <span className="college-usage maigre" title="Référents qui portent ce titre">
                {titre.utilisations > 0 ? `${titre.utilisations} référent${titre.utilisations > 1 ? 's' : ''}` : '—'}
              </span>

              <Link
                href={`/espace/parametres/college?supprimer=${titre.id}`}
                className="geste geste--retirer"
                aria-label={`Retirer ${titre.nom}`}
                title="Retirer ce titre"
              >
                <Corbeille />
              </Link>
            </li>
          ))}
        </ol>
      )}

      {aRetirer && (
        <div className="fenetre-fond">
          <Link
            href="/espace/parametres/college"
            className="fenetre-voile"
            aria-label="Fermer sans rien retirer"
          />

          <div className="fenetre" role="dialog" aria-modal="true" aria-labelledby="retrait-titre">
            <h2 id="retrait-titre">Retirer « {aRetirer.nom} » de la liste&nbsp;?</h2>

            <p>
              Le titre ne sera plus proposé sur les fiches. Celles qui le portent
              {aRetirer.utilisations > 0 ? (
                <>
                  {' '}
                  — il y en a <strong>{aRetirer.utilisations}</strong> — le gardent&nbsp;: rien
                  n&apos;est effacé sur une fiche.
                </>
              ) : (
                <> le garderaient, mais aucune ne le porte.</>
              )}
            </p>

            <div className="fenetre-gestes">
              <Link href="/espace/parametres/college" className="bouton">
                Annuler
              </Link>
              <form method="post" action={`/api/parametres/college/${aRetirer.id}`}>
                <input type="hidden" name="action" value="supprimer" />
                <button className="bouton bouton--danger" type="submit">
                  Retirer le titre
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
