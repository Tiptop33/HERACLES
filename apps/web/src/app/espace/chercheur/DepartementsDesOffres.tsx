'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { basculer } from '@/lib/page-candidat';

/**
 * Les départements des offres, à cocher (0105). Chaque geste est retenu pour
 * la prochaine visite, puis la liste se recalcule. Aucun coché : tous.
 */
export default function DepartementsDesOffres({
  choisis: initiaux,
  proposes,
}: {
  choisis: string[];
  proposes: { code: string; nom: string; nombre: number }[];
}) {
  const router = useRouter();
  const [choisis, setChoisis] = useState(initiaux);
  const [erreur, setErreur] = useState<string | null>(null);
  const [, demarrer] = useTransition();

  async function toucher(code: string) {
    const avant = choisis;
    const suite = basculer(choisis, code);
    setChoisis(suite);
    setErreur(null);
    try {
      const reponse = await fetch('/api/espace-candidat/departements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ departements: suite }),
      });
      if (!reponse.ok) throw new Error('refus');
      demarrer(() => router.refresh());
    } catch {
      setChoisis(avant);
      setErreur('Ce choix n’a pas pu être enregistré. Réessayez.');
    }
  }

  return (
    <div className="pc-rang" role="group" aria-label="Départements">
      <span className="pc-rang-titre">Départements</span>
      {proposes.length === 0 ? (
        <span className="pc-note">aucune offre en cours dans vos secteurs</span>
      ) : (
        proposes.map((d) => (
          <button
            key={d.code}
            type="button"
            className="pc-puce"
            aria-pressed={choisis.includes(d.code)}
            onClick={() => void toucher(d.code)}
          >
            {d.nom}
            <span className="pc-puce-nombre">{d.nombre}</span>
          </button>
        ))
      )}
      {choisis.length === 0 && proposes.length > 0 && <span className="pc-note">tous les départements</span>}
      {erreur && (
        <p className="pc-erreur" role="alert">
          {erreur}
        </p>
      )}
    </div>
  );
}
