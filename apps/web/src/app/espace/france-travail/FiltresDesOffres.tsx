'use client';

import { useEffect, useOptimistic, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  adresseDesOffres,
  basculerDepartement,
  nomDuDepartement,
  resumeDesDepartements,
  type FiltresDesOffres as Filtres,
  type MenusDesOffres,
} from '@/lib/offres';

/**
 * Les deux filtres de l'écran « France Travail » (23 novembre 2026, à la
 * demande) : un ou plusieurs départements, et un secteur d'activité.
 *
 * Chaque geste s'applique aussitôt : il réécrit l'adresse, et la page relit la
 * liste. Pas de bouton « Appliquer ». L'adresse porte les filtres — elle se
 * recharge, se garde en favori et s'envoie telle quelle.
 *
 * Les départements se cochent dans un panneau flottant, non modal : il ne
 * voile rien, et se referme d'un clic ailleurs ou d'« Échap ». Le secteur est
 * un menu déroulant du système — sur un iPad, c'est la roue native.
 *
 * `useOptimistic` : la case se coche à l'instant du clic, sans attendre que le
 * serveur ait rendu la liste.
 */
export default function FiltresDesOffres({
  filtres,
  menus,
}: {
  filtres: Filtres;
  menus: MenusDesOffres;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [affiches, afficher] = useOptimistic(filtres);
  const [ouvert, setOuvert] = useState(false);
  const cadre = useRef<HTMLDivElement>(null);

  // Le panneau se referme d'un clic ailleurs ou d'« Échap » — sans rien
  // annuler : ce qui est coché est déjà appliqué.
  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: PointerEvent) => {
      if (cadre.current && !cadre.current.contains(e.target as Node)) setOuvert(false);
    };
    const touche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOuvert(false);
    };
    document.addEventListener('pointerdown', dehors);
    document.addEventListener('keydown', touche);
    return () => {
      document.removeEventListener('pointerdown', dehors);
      document.removeEventListener('keydown', touche);
    };
  }, [ouvert]);

  const appliquer = (suivants: Filtres) => {
    demarrer(() => {
      afficher(suivants);
      router.replace(adresseDesOffres(suivants), { scroll: false });
    });
  };

  return (
    <div className="filtres-des-offres" aria-busy={enCours}>
      <div className="choix-departements" ref={cadre}>
        <button
          type="button"
          className="filtre-loge choix-departements-bouton"
          aria-haspopup="true"
          aria-expanded={ouvert}
          aria-controls="panneau-departements"
          onClick={() => setOuvert((o) => !o)}
        >
          {resumeDesDepartements(affiches.departements)}
          <span aria-hidden="true"> ▾</span>
        </button>

        {ouvert && (
          <div
            id="panneau-departements"
            className="choix-departements-panneau"
            role="group"
            aria-label="Départements"
          >
            {menus.departements.length === 0 ? (
              <p className="maigre">Aucune offre en cours ne porte de département.</p>
            ) : (
              <>
                <label className="choix-departements-ligne">
                  <input
                    type="checkbox"
                    checked={affiches.departements.length === 0}
                    // Déjà « tous » : il n'y a rien à décocher.
                    disabled={affiches.departements.length === 0}
                    onChange={() => appliquer({ ...affiches, departements: [] })}
                  />
                  Tous les départements
                </label>
                {menus.departements.map((numero) => (
                  <label key={numero} className="choix-departements-ligne">
                    <input
                      type="checkbox"
                      checked={affiches.departements.includes(numero)}
                      onChange={() => appliquer(basculerDepartement(affiches, numero))}
                    />
                    {nomDuDepartement(numero)}
                  </label>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      <select
        className="filtre-loge"
        aria-label="Secteur d’activité"
        value={affiches.secteur}
        onChange={(e) => appliquer({ ...affiches, secteur: e.target.value })}
      >
        <option value="">Tous les secteurs d’activité</option>
        {menus.secteurs.map((s) => (
          <option key={s.code} value={s.code}>
            {s.intitule ? `${s.code} — ${s.intitule}` : s.code}
          </option>
        ))}
      </select>
    </div>
  );
}
