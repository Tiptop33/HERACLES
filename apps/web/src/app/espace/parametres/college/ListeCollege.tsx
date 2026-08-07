'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { deplacerDans, type TitreCollege } from '@/lib/college';
import { Corbeille, Poignee } from '@/components/Icones';

/**
 * La liste des titres, qu'on range en tirant une poignée.
 *
 * **Les flèches ↑ ↓ restent, mais ne se montrent pas partout.** Le
 * glisser-déposer du navigateur ignore le doigt : sur une tablette, la poignée
 * ne servirait à rien et ce sont les flèches qui rangent. Avec une souris,
 * c'est l'inverse — les flèches encombreraient, et le style les cache. Elles
 * reparaissent dès qu'on entre dans la ligne au clavier, sans quoi ranger
 * deviendrait impossible sans souris.
 *
 * Ce sont des formulaires ordinaires : elles marchent avant que la moindre
 * ligne de script ne soit chargée.
 *
 * Le rangement est optimiste : la liste bouge à l'écran d'abord, le serveur
 * est prévenu ensuite. S'il refuse, on remet la liste comme elle était et on
 * le dit — une liste qui a l'air rangée alors qu'elle ne l'est pas est pire
 * qu'un refus.
 */
export default function ListeCollege({ titres }: { titres: TitreCollege[] }) {
  const router = useRouter();
  const [range, setRange] = useState<TitreCollege[] | null>(null);
  const [reference, setReference] = useState(titres);
  const [attrapable, setAttrapable] = useState<string | null>(null);
  const [tire, setTire] = useState<string | null>(null);
  const [survole, setSurvole] = useState<string | null>(null);
  const [souci, setSouci] = useState<string | null>(null);

  // Le serveur reste la référence : dès qu'une nouvelle liste arrive d'en
  // haut — après un ajout, un renommage, un rangement —, l'ordre gardé ici
  // n'a plus lieu d'être. On l'abandonne pendant le rendu plutôt que dans un
  // effet : c'est la façon dont React veut qu'un état s'ajuste à ses props,
  // et cela évite un affichage intermédiaire avec l'ancienne liste.
  if (reference !== titres) {
    setReference(titres);
    setRange(null);
  }

  const ordre = range ?? titres;
  const setOrdre = setRange;

  async function deposer(cible: string) {
    if (!tire || tire === cible) return;

    const depart = ordre;
    const nouvel = deplacerDans(ordre, tire, cible);

    setOrdre(nouvel);
    setSouci(null);

    try {
      const reponse = await fetch('/api/parametres/college/ordre', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ordre: nouvel.map((t) => t.id) }),
      });

      if (!reponse.ok) {
        const resultat = await reponse.json().catch(() => ({}));
        setOrdre(depart);
        setSouci(resultat.erreur ?? "La liste n'a pas pu être rangée.");
        return;
      }
      router.refresh();
    } catch {
      setOrdre(depart);
      setSouci('La connexion au serveur a échoué. La liste n’a pas bougé.');
    }
  }

  if (ordre.length === 0) {
    return <p className="vide-liste">La liste est vide. Le champ « Collège » ne proposera rien.</p>;
  }

  return (
    <>
      {souci && (
        <p className="erreur" role="alert">
          {souci}
        </p>
      )}

      <ol className="college-liste">
        {ordre.map((titre, place) => (
          <li
            key={titre.id}
            className={`college-ligne${tire === titre.id ? ' college-ligne--tiree' : ''}${
              survole === titre.id && tire && tire !== titre.id ? ' college-ligne--cible' : ''
            }`}
            // `draggable` ne s'active qu'au moment où l'on saisit la poignée :
            // sur une ligne tout entière draggable, on ne peut plus
            // sélectionner le texte du champ.
            draggable={attrapable === titre.id}
            onDragStart={(e) => {
              setTire(titre.id);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', titre.id);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setSurvole(titre.id);
            }}
            onDrop={(e) => {
              e.preventDefault();
              void deposer(titre.id);
              setTire(null);
              setSurvole(null);
              setAttrapable(null);
            }}
            onDragEnd={() => {
              setTire(null);
              setSurvole(null);
              setAttrapable(null);
            }}
          >
            <span
              className="college-poignee"
              onMouseDown={() => setAttrapable(titre.id)}
              onMouseUp={() => setAttrapable(null)}
              aria-hidden="true"
              title="Tirer pour ranger"
            >
              <Poignee />
            </span>

            {/* Les flèches : le même rangement, au doigt ou au clavier. */}
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
                  disabled={place === ordre.length - 1}
                  aria-label={`Descendre ${titre.nom}`}
                  title="Descendre"
                >
                  ↓
                </button>
              </form>
            </span>

            {/* Le champ et son bouton sont dans deux endroits de la ligne, mais
                dans le même formulaire : `form=` relie un bouton au
                formulaire qu'il valide, sans une ligne de script. */}
            <form
              id={`renommer-${titre.id}`}
              method="post"
              action={`/api/parametres/college/${titre.id}`}
            >
              <input type="hidden" name="action" value="renommer" />
              <input
                className="college-nom"
                name="nom"
                defaultValue={titre.nom}
                maxLength={120}
                required
                aria-label={`Titre : ${titre.nom}`}
              />
            </form>

            <span className="college-usage maigre" title="Référents qui portent ce titre">
              {titre.utilisations > 0
                ? `${titre.utilisations} référent${titre.utilisations > 1 ? 's' : ''}`
                : '—'}
            </span>

            <button className="bouton college-enregistrer" type="submit" form={`renommer-${titre.id}`}>
              Enregistrer
            </button>

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
    </>
  );
}
