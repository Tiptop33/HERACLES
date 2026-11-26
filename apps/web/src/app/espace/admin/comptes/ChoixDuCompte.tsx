'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { LogeBreve } from '@/lib/administration';
import { libelleRoleInvitation } from '@/lib/libelle-role';

const ROLES = ['referent', 'chercheur', 'admin'] as const;

type Props = {
  id: string;
  nom: string;
  role: string;
  logeId: string | null;
  aUneFiche: boolean;
  cEstMoi: boolean;
  loges: LogeBreve[];
};

/**
 * Les cellules « Rôle » et « Loge » d'un compte, sous forme de menus. Le choix
 * s'applique aussitôt : pas de bouton à valider, comme dans le tableau des
 * invitations.
 *
 * L'écran montre d'abord le nouveau choix, puis revient à l'ancien si le
 * serveur refuse — la base reste la seule à dire ce qui est enregistré.
 *
 * Deux cellules ne sont pas des menus :
 *   * son propre rôle — la base le refuserait, et l'on s'enfermerait dehors ;
 *   * la loge d'un compte de base sans fiche référent — il n'a nulle part où
 *     la garder. Elle s'ouvre dès qu'il devient référent.
 */
export default function ChoixDuCompte({ id, nom, role, logeId, aUneFiche, cEstMoi, loges }: Props) {
  const router = useRouter();
  const [roleChoisi, setRoleChoisi] = useState(role);
  const [logeChoisie, setLogeChoisie] = useState(logeId ?? '');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function enregistrer(nouveauRole: string, nouvelleLoge: string) {
    const avantRole = roleChoisi;
    const avantLoge = logeChoisie;
    setRoleChoisi(nouveauRole);
    setLogeChoisie(nouvelleLoge);
    setErreur(null);
    setEnvoi(true);

    try {
      const reponse = await fetch('/api/comptes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          role: nouveauRole,
          loge_id: nouvelleLoge === '' ? null : nouvelleLoge,
        }),
      });
      const resultat = await reponse.json().catch(() => ({}));
      if (!reponse.ok) {
        setRoleChoisi(avantRole);
        setLogeChoisie(avantLoge);
        setErreur(resultat.erreur ?? "Le compte n'a pas pu être modifié.");
        return;
      }
      // Le nom de la loge, et la fiche peut-être née, viennent du serveur.
      router.refresh();
    } catch {
      setRoleChoisi(avantRole);
      setLogeChoisie(avantLoge);
      setErreur('La connexion au serveur a échoué. Réessayez.');
    } finally {
      setEnvoi(false);
    }
  }

  const logeOuverte = aUneFiche || roleChoisi !== 'chercheur';

  return (
    <>
      <td className="maigre">
        {cEstMoi ? (
          <span title="On ne change pas son propre rôle.">{libelleRoleInvitation(role)}</span>
        ) : (
          <select
            aria-label={`Rôle du compte de ${nom}`}
            value={roleChoisi}
            disabled={envoi}
            onChange={(e) => enregistrer(e.target.value, logeChoisie)}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {libelleRoleInvitation(r)}
              </option>
            ))}
          </select>
        )}
        {erreur && (
          <p className="erreur" role="alert" style={{ margin: '0.3rem 0 0' }}>
            {erreur}
          </p>
        )}
      </td>
      <td className="maigre">
        {logeOuverte ? (
          <select
            aria-label={`Loge du compte de ${nom}`}
            value={logeChoisie}
            disabled={envoi}
            onChange={(e) => enregistrer(roleChoisi, e.target.value)}
          >
            <option value="">— aucune pour l&apos;instant —</option>
            {loges.map((loge) => (
              <option key={loge.id} value={loge.id}>
                {loge.nom ?? 'Sans nom'}
              </option>
            ))}
          </select>
        ) : (
          '—'
        )}
      </td>
    </>
  );
}
