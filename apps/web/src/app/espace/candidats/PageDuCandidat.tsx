'use client';

import { useState } from 'react';
import { dateEnLettres } from '@/lib/format';
import type { EtatDeLaPage } from '@/lib/page-candidat-serveur';
import LienACopier from './nouveau/LienACopier';

/**
 * Sur la fiche, sous l'en-tête : où en est la page du candidat (0105), et le
 * bouton qui l'y invite. Une invitation de plus remplace la précédente.
 *
 * Si le courriel ne part pas, le lien s'affiche pour être transmis à la main —
 * une fois : HERACLES n'en garde que l'empreinte.
 */
export default function PageDuCandidat({
  candidat,
  prenom,
  etat,
}: {
  candidat: string;
  prenom: string | null;
  etat: EtatDeLaPage;
}) {
  const [envoi, setEnvoi] = useState(false);
  const [issue, setIssue] = useState<{ texte: string; lien?: string; erreur?: boolean } | null>(null);
  const [inviteeLe, setInviteeLe] = useState(etat.invitee_le);

  async function inviter() {
    setEnvoi(true);
    setIssue(null);
    try {
      const reponse = await fetch(`/api/candidats/${candidat}/page-candidat`, { method: 'POST' });
      const lu = (await reponse.json().catch(() => null)) as {
        envoye?: boolean;
        email?: string;
        lien?: string;
        erreur?: string;
      } | null;
      if (!reponse.ok || !lu) {
        setIssue({ texte: lu?.erreur ?? 'L’invitation n’a pas pu partir. Réessayez.', erreur: true });
        return;
      }
      setInviteeLe(new Date().toISOString());
      setIssue(
        lu.envoye
          ? { texte: `Invitation envoyée à ${lu.email}. Le lien vaut trente jours.` }
          : { texte: 'Le courriel n’est pas parti. Transmettez ce lien au candidat :', lien: lu.lien },
      );
    } catch {
      setIssue({ texte: 'Le serveur ne répond pas. L’invitation n’est pas partie.', erreur: true });
    } finally {
      setEnvoi(false);
    }
  }

  const expiree = estPassee(etat.invitation_expire_le);
  const statut = etat.a_un_compte
    ? etat.vue_le
      ? `Page ouverte · dernière visite ${dateEnLettres(etat.vue_le)}`
      : 'Page ouverte'
    : inviteeLe
      ? expiree
        ? `Invitation du ${dateEnLettres(inviteeLe)} expirée`
        : `Invitation envoyée le ${dateEnLettres(inviteeLe)}`
      : 'Pas encore invité à sa page';

  const libelle = etat.a_un_compte || inviteeLe ? 'Renvoyer l’invitation' : `Inviter ${prenom ?? 'le candidat'} à sa page`;

  return (
    <div className="page-candidat-etat">
      <span>
        Page candidat&nbsp;: <strong>{statut}</strong>
      </span>
      {etat.peut_inviter &&
        (etat.a_un_email ? (
          <button type="button" className="bouton" onClick={() => void inviter()} disabled={envoi}>
            {envoi ? 'Envoi…' : libelle}
          </button>
        ) : (
          <span className="maigre">Ajoutez son adresse e-mail à la fiche pour l’inviter.</span>
        ))}
      {issue &&
        (issue.lien ? (
          <LienACopier lien={issue.lien} consigne={issue.texte} />
        ) : (
          <span className={issue.erreur ? 'erreur' : 'maigre'} role="status">
            {issue.texte}
          </span>
        ))}
    </div>
  );
}

/** Une échéance dépassée — lue à l'affichage, comme le reste de la fiche. */
function estPassee(iso: string | null): boolean {
  return Boolean(iso) && new Date(iso as string).getTime() < Date.now();
}
