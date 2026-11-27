'use client';

import { useEffect, useState } from 'react';
import {
  LONGUEUR_DU_MESSAGE,
  quand,
  tempsPourCorriger,
  validerUnMessage,
  type MessageDuCandidat,
} from '@/lib/page-candidat';

/**
 * « Où j'en suis » (0105). Le candidat écrit à son référent et à son parrain.
 * Il corrige un message pendant 24 heures, sur place ; ensuite le message est
 * gardé tel quel — la base le refuse, l'écran ne fait que le montrer.
 */
export default function MessagesDuCandidat({
  initiaux,
  maintenantDuServeur,
}: {
  initiaux: MessageDuCandidat[];
  maintenantDuServeur: number;
}) {
  const [messages, setMessages] = useState(initiaux);
  const [texte, setTexte] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCorrection, setEnCorrection] = useState<string | null>(null);
  const [erreurDeCorrection, setErreurDeCorrection] = useState<string | null>(null);
  // L'heure du serveur au premier rendu, puis celle du navigateur, minute par
  // minute : un message passe de « modifiable » à « conservé » sous les yeux.
  const [maintenant, setMaintenant] = useState(maintenantDuServeur);
  useEffect(() => {
    const minuteur = setInterval(() => setMaintenant(Date.now()), 60_000);
    return () => clearInterval(minuteur);
  }, []);

  async function envoyer(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const verdict = validerUnMessage(texte);
    if (!verdict.ok) return setErreur(verdict.message);
    setEnvoi(true);
    setErreur(null);
    try {
      const reponse = await fetch('/api/espace-candidat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texte: verdict.valeur }),
      });
      const lu = (await reponse.json().catch(() => null)) as { message?: MessageDuCandidat; erreur?: string } | null;
      if (!reponse.ok || !lu?.message) return setErreur(lu?.erreur ?? 'L’envoi a échoué. Réessayez.');
      const nouveau = lu.message;
      setMessages((m) => [nouveau, ...m]);
      setTexte('');
      setMaintenant(Date.now());
    } catch {
      setErreur('Le serveur ne répond pas. Votre message n’est pas parti.');
    } finally {
      setEnvoi(false);
    }
  }

  async function corriger(m: MessageDuCandidat, brut: string) {
    const verdict = validerUnMessage(brut);
    if (!verdict.ok) return setErreurDeCorrection(verdict.message);
    if (verdict.valeur === m.texte) {
      setEnCorrection(null);
      return setErreurDeCorrection(null);
    }
    try {
      const reponse = await fetch(`/api/espace-candidat/messages/${m.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texte: verdict.valeur }),
      });
      const lu = (await reponse.json().catch(() => null)) as { message?: MessageDuCandidat; erreur?: string } | null;
      if (!reponse.ok || !lu?.message) return setErreurDeCorrection(lu?.erreur ?? 'La correction a échoué.');
      const corrige = lu.message;
      setMessages((liste) => liste.map((x) => (x.id === m.id ? corrige : x)));
      setEnCorrection(null);
      setErreurDeCorrection(null);
    } catch {
      setErreurDeCorrection('Le serveur ne répond pas. La correction n’est pas enregistrée.');
    }
  }

  return (
    <section
      className="pc-bloc"
      id="pc-messages"
      aria-labelledby="pc-messages-titre"
      data-aide="candidat-messages"
    >
      <header>
        <h2 id="pc-messages-titre">Où j’en suis</h2>
      </header>
      <p className="pc-aide">
        Dites à votre référent et à votre parrain où en est votre recherche : une candidature envoyée, un
        entretien, une réponse.
      </p>

      <form className="pc-ecrire" onSubmit={envoyer} noValidate>
        <label htmlFor="pc-message" className="pc-libelle">
          Votre message
        </label>
        <textarea
          id="pc-message"
          value={texte}
          maxLength={LONGUEUR_DU_MESSAGE}
          rows={4}
          placeholder="Par exemple : entretien jeudi à 10 h chez Garonne Construction."
          onChange={(e) => setTexte(e.target.value)}
        />
        {erreur && (
          <p className="pc-erreur" role="alert">
            {erreur}
          </p>
        )}
        <div className="pc-ecrire-pied">
          <span className="pc-compteur">
            {texte.length} / {LONGUEUR_DU_MESSAGE}
          </span>
          <button className="bouton bouton--marque" type="submit" disabled={envoi || !texte.trim()}>
            {envoi ? 'Envoi…' : 'Envoyer'}
          </button>
        </div>
        <p className="pc-note">Vous pourrez corriger un message pendant 24 heures. Ensuite, il est gardé tel quel.</p>
      </form>

      {messages.length === 0 ? (
        <p className="pc-vide">Vous n’avez encore rien écrit.</p>
      ) : (
        <ol className="pc-journal" aria-label="Vos messages">
          {messages.map((m) => {
            const reste = tempsPourCorriger(m.ecrit_le, maintenant);
            const ouvert = enCorrection === m.id && reste;
            return (
              <li key={m.id} className={reste ? 'pc-vivant' : undefined}>
                <div className="pc-meta">
                  <span>{quand(m.ecrit_le, maintenant)}</span>
                  {m.corrige_le && <span>· corrigé</span>}
                  {reste ? (
                    <span className="pc-etiquette pc-etiquette--attente">Modifiable encore {reste}</span>
                  ) : (
                    <span className="pc-etiquette pc-etiquette--clos">Conservé</span>
                  )}
                </div>
                {ouvert ? (
                  <>
                    <textarea
                      defaultValue={m.texte}
                      maxLength={LONGUEUR_DU_MESSAGE}
                      rows={3}
                      aria-label="Corriger le message"
                      autoFocus
                      onBlur={(e) => void corriger(m, e.target.value)}
                    />
                    <p className="pc-note">La correction est enregistrée dès que vous quittez le champ.</p>
                    {erreurDeCorrection && (
                      <p className="pc-erreur" role="alert">
                        {erreurDeCorrection}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="pc-texte">{m.texte}</p>
                    {reste && (
                      <button type="button" className="pc-lien" onClick={() => setEnCorrection(m.id)}>
                        Corriger
                      </button>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
