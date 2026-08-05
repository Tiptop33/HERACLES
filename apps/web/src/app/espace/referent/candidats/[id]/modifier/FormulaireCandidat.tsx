'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FicheCandidat } from '@/lib/candidat';
import { datePourChamp, depuis } from '@/lib/format';

/** Les champs que l'écran de saisie enregistre. Le rattachement n'en fait pas partie. */
const CHAMPS = [
  'prenom',
  'nom',
  'telephone',
  'email',
  'ville',
  'code_postal',
  'type_emploi',
  'emploi_recherche',
  'mobilite_geographique',
  'debut_stage',
  'experiences',
  'appreciation',
] as const;

const TYPES = ['Alternance', 'Emploi', 'Stage'];

export default function FormulaireCandidat({ candidat }: { candidat: FicheCandidat }) {
  const router = useRouter();
  const retour = `/espace/referent/candidats/${candidat.id}`;

  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [enregistre, setEnregistre] = useState<string | null>(null);

  // Le type repris de Bubble n'est pas toujours l'un des trois proposés : on
  // l'ajoute à la liste plutôt que de l'écraser silencieusement à l'ouverture.
  const types =
    candidat.type_emploi && !TYPES.includes(candidat.type_emploi)
      ? [candidat.type_emploi, ...TYPES]
      : TYPES;

  async function soumettre(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    setErreur(null);
    setEnvoi(true);

    const champs = new FormData(evenement.currentTarget);
    const corps = Object.fromEntries(
      CHAMPS.map((cle) => [cle, String(champs.get(cle) ?? '')]),
    );

    try {
      const reponse = await fetch(`/api/candidats/${candidat.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps),
      });

      const resultat = await reponse.json();
      if (!reponse.ok) {
        setErreur(resultat.erreur ?? "L'enregistrement a échoué.");
        return;
      }

      setEnregistre(resultat.maj_le ?? null);
      router.refresh();
      router.push(retour);
    } catch {
      setErreur('La connexion au serveur a échoué. Réessayez.');
    } finally {
      setEnvoi(false);
    }
  }

  const derniere = depuis(enregistre ?? candidat.maj_le);

  return (
    <form onSubmit={soumettre}>
      <div className="corps">
        <p className="fil">
          <Link href="/espace/referent">Mes candidats</Link> <span aria-hidden="true">›</span>{' '}
          <Link href={retour}>
            {[candidat.prenom, candidat.nom].filter(Boolean).join(' ') || 'Sans nom'}
          </Link>{' '}
          <span aria-hidden="true">›</span> <span>Modification</span>
        </p>

        {erreur && <p className="erreur">{erreur}</p>}

        <div className="blocs">
          <section className="bloc bloc--large">
            <h2>Identité et contact</h2>
            <div className="ligne-edition">
              <div className="champ">
                <label htmlFor="prenom">Prénom</label>
                <input id="prenom" name="prenom" defaultValue={candidat.prenom ?? ''} />
              </div>
              <div className="champ">
                <label htmlFor="nom">Nom</label>
                <input id="nom" name="nom" defaultValue={candidat.nom ?? ''} />
              </div>
              <div className="champ">
                <label htmlFor="telephone">Téléphone</label>
                <input
                  id="telephone"
                  name="telephone"
                  defaultValue={candidat.telephone ?? ''}
                  autoComplete="tel"
                />
              </div>
              <div className="champ">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  defaultValue={candidat.email ?? ''}
                  autoComplete="email"
                />
              </div>
              <div className="champ">
                <label htmlFor="ville">Ville</label>
                <input id="ville" name="ville" defaultValue={candidat.ville ?? ''} />
              </div>
              <div className="champ">
                <label htmlFor="code_postal">Code postal</label>
                <input
                  id="code_postal"
                  name="code_postal"
                  inputMode="numeric"
                  defaultValue={candidat.code_postal ?? ''}
                />
              </div>
            </div>
            {!candidat.ville && candidat.adresse && (
              <p className="aide">Adresse reprise de Bubble : {candidat.adresse}</p>
            )}
          </section>

          <section className="bloc bloc--large">
            <h2>Sa recherche</h2>
            <div className="ligne-edition">
              <div className="champ">
                <label htmlFor="type_emploi">Type de recherche</label>
                <select
                  id="type_emploi"
                  name="type_emploi"
                  defaultValue={candidat.type_emploi ?? ''}
                >
                  <option value="">—</option>
                  {types.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
              <div className="champ">
                <label htmlFor="emploi_recherche">Métier visé</label>
                <input
                  id="emploi_recherche"
                  name="emploi_recherche"
                  defaultValue={candidat.emploi_recherche ?? ''}
                />
              </div>
              <div className="champ">
                <label htmlFor="mobilite_geographique">Mobilité</label>
                <input
                  id="mobilite_geographique"
                  name="mobilite_geographique"
                  defaultValue={candidat.mobilite_geographique ?? ''}
                />
              </div>
              <div className="champ">
                <label htmlFor="debut_stage">Disponible à partir du</label>
                <input
                  id="debut_stage"
                  name="debut_stage"
                  type="date"
                  defaultValue={datePourChamp(candidat.debut_stage)}
                />
              </div>
            </div>
          </section>

          <section className="bloc bloc--large">
            <h2>Parcours</h2>
            <div className="champ">
              <label htmlFor="experiences">Expériences</label>
              <textarea
                id="experiences"
                name="experiences"
                rows={5}
                defaultValue={candidat.experiences ?? ''}
              />
            </div>
          </section>

          <section className="bloc">
            <h2>Accompagnement</h2>
            <div className="champ champ--verrouille">
              <label htmlFor="referent">Référent</label>
              <input id="referent" defaultValue={candidat.referent ?? '—'} readOnly />
              <span className="aide">
                Le rattachement se change depuis l&apos;administration de la loge.
              </span>
            </div>
          </section>

          <section className="bloc">
            <h2>Suivi</h2>
            <div className="champ">
              <label htmlFor="appreciation">Appréciation</label>
              <input
                id="appreciation"
                name="appreciation"
                defaultValue={candidat.appreciation ?? ''}
              />
            </div>
          </section>
        </div>
      </div>

      <div className="barre-enregistrement">
        <div className="barre-enregistrement-dedans">
          <span className="etat-sauvegarde">
            {derniere ? `Dernière modification enregistrée ${derniere}` : 'Jamais modifiée'}
          </span>
          <div className="droite">
            <Link href={retour} className="bouton">
              Annuler
            </Link>
            <button type="submit" className="bouton bouton--fort" disabled={envoi}>
              {envoi ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
