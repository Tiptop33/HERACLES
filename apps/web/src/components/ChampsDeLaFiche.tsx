'use client';

import { useState } from 'react';
import {
  MOBILITES,
  OUI_NON,
  SITUATIONS_FAMILIALES,
  TYPES_DE_RECHERCHE,
  estUnStage,
} from '@/lib/parrainage';

/**
 * Les champs de la fiche du candidat, tels qu'il les remplit lui-même.
 *
 * Partagés par le lien de 0057 (`/candidature/[jeton]`) et par l'espace
 * candidat (`/espace/candidat`) : la même fiche, aux mêmes libellés, d'où
 * qu'on la remplisse. Le formulaire qui les entoure décide de l'envoi, des
 * documents et du consentement.
 */

export type ValeursDeLaFiche = Partial<Record<string, string | number | null>>;

export default function ChampsDeLaFiche({
  initial,
  champFautif,
  email,
}: {
  initial: ValeursDeLaFiche;
  champFautif: string | null;
  /**
   * L'adresse e-mail : modifiable sur le lien de 0057, verrouillée dans
   * l'espace candidat, où elle est celle du compte.
   */
  email: { valeur: string; verrouillee: boolean };
}) {
  const [type, setType] = useState(String(initial.type_emploi ?? ''));

  const valeur = (nom: string) => {
    const v = initial[nom];
    return v === null || v === undefined ? '' : String(v);
  };

  const champ = (nom: string) => ({
    id: `c-${nom}`,
    name: nom,
    'aria-invalid': champFautif === nom ? true : undefined,
  });

  return (
    <>
      <fieldset>
        <legend>Vous</legend>
        <div className="ligne-edition">
          <div className="champ">
            <label htmlFor="c-prenom">Prénom *</label>
            <input {...champ('prenom')} defaultValue={valeur('prenom')} autoComplete="given-name" required />
          </div>
          <div className="champ">
            <label htmlFor="c-nom">Nom *</label>
            <input {...champ('nom')} defaultValue={valeur('nom')} autoComplete="family-name" required />
          </div>
          <div className={`champ${email.verrouillee ? ' champ--verrouille' : ''}`}>
            <label htmlFor="c-email">E-mail *</label>
            {email.verrouillee ? (
              // L'adresse du compte : la changer changerait de personne.
              <input id="c-email" type="email" value={email.valeur} readOnly />
            ) : (
              <input {...champ('email')} type="email" defaultValue={email.valeur} autoComplete="email" required />
            )}
          </div>
          <div className="champ">
            <label htmlFor="c-telephone">Téléphone *</label>
            <input {...champ('telephone')} type="tel" defaultValue={valeur('telephone')} autoComplete="tel" required />
          </div>
          <div className="champ">
            <label htmlFor="c-age">Âge *</label>
            <input
              {...champ('age')}
              type="number"
              inputMode="numeric"
              min={14}
              max={99}
              defaultValue={valeur('age')}
              required
            />
          </div>
          <div className="champ">
            <label htmlFor="c-situation_familiale">Situation familiale *</label>
            <select {...champ('situation_familiale')} defaultValue={valeur('situation_familiale')} required>
              <option value="" disabled>
                Choisir…
              </option>
              {SITUATIONS_FAMILIALES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="champ">
          <label htmlFor="c-adresse">Adresse *</label>
          <input {...champ('adresse')} defaultValue={valeur('adresse')} autoComplete="street-address" required />
        </div>
        <div className="ligne-edition">
          <div className="champ">
            <label htmlFor="c-code_postal">Code postal *</label>
            <input
              {...champ('code_postal')}
              inputMode="numeric"
              defaultValue={valeur('code_postal')}
              autoComplete="postal-code"
              required
            />
          </div>
          <div className="champ">
            <label htmlFor="c-ville">Ville *</label>
            <input {...champ('ville')} defaultValue={valeur('ville')} autoComplete="address-level2" required />
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend>Votre recherche</legend>
        <div className="ligne-edition">
          <div className="champ">
            <label htmlFor="c-type_emploi">Type de recherche *</label>
            <select {...champ('type_emploi')} value={type} onChange={(e) => setType(e.target.value)} required>
              <option value="" disabled>
                Choisir…
              </option>
              {TYPES_DE_RECHERCHE.map((t) => (
                <option key={t.valeur} value={t.valeur}>
                  {t.libelle}
                </option>
              ))}
            </select>
          </div>
          <div className="champ">
            <label htmlFor="c-emploi_recherche">Métier visé *</label>
            <input {...champ('emploi_recherche')} defaultValue={valeur('emploi_recherche')} required />
          </div>
          <div className="champ">
            <label htmlFor="c-mobilite_geographique">Mobilité géographique *</label>
            <select {...champ('mobilite_geographique')} defaultValue={valeur('mobilite_geographique')} required>
              <option value="" disabled>
                Choisir…
              </option>
              {MOBILITES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Les dates ne concernent qu'un stage. Sans script, elles restent
            affichées : mieux vaut un champ de trop qu'une date impossible à
            donner. */}
        {(estUnStage(type) || !type) && (
          <div className="ligne-edition">
            <div className="champ">
              <label htmlFor="c-debut_stage">Début du stage</label>
              <input {...champ('debut_stage')} type="date" defaultValue={valeur('debut_stage').slice(0, 10)} />
            </div>
            <div className="champ">
              <label htmlFor="c-fin_stage">Fin du stage</label>
              <input {...champ('fin_stage')} type="date" defaultValue={valeur('fin_stage').slice(0, 10)} />
            </div>
          </div>
        )}

        <div className="champ">
          <label htmlFor="c-definition_emploi">Définition très précise de l’emploi recherché *</label>
          <textarea
            {...champ('definition_emploi')}
            rows={3}
            placeholder="RESPONSABLE D’AGENCE ; CADRE ; …"
            defaultValue={valeur('definition_emploi')}
            required
          />
        </div>
      </fieldset>

      <fieldset>
        <legend>Permis et véhicule</legend>
        <div className="ligne-edition">
          {(
            [
              ['permis_vl', 'Permis B (voiture) *'],
              ['permis_moto', 'Permis moto *'],
              ['permis_pl', 'Permis poids lourd *'],
              ['vehicule', 'Véhicule *'],
            ] as const
          ).map(([nom, libelle]) => (
            <div className="champ" key={nom}>
              <label htmlFor={`c-${nom}`}>{libelle}</label>
              <select {...champ(nom)} defaultValue={valeur(nom)} required>
                <option value="" disabled>
                  Choisir…
                </option>
                {OUI_NON.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Votre parcours</legend>
        {(
          [
            ['formations', 'Formation *', true],
            ['experiences', 'Expériences *', true],
            ['competences', 'Compétences *', true],
            ['informatique', 'Informatique', false],
            ['savoir_etre', 'Savoir-être', false],
            ['centres_interet', 'Centres d’intérêt', false],
          ] as const
        ).map(([nom, libelle, requis]) => (
          <div className="champ" key={nom}>
            <label htmlFor={`c-${nom}`}>{libelle}</label>
            <textarea
              {...champ(nom)}
              rows={nom === 'experiences' ? 5 : 3}
              defaultValue={valeur(nom)}
              required={requis}
            />
          </div>
        ))}
      </fieldset>
    </>
  );
}
