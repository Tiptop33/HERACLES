'use client';

import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';

/**
 * « Continuer avec Google », tel que la maquette le dessine.
 *
 * Il fonctionnera le jour où le fournisseur Google sera déclaré dans Supabase —
 * identifiants OAuth à créer chez Google, puis à coller dans la configuration.
 * D'ici là, Supabase refuse la demande et le bouton le dit, en clair, sous
 * lui-même : mieux vaut un bouton qui explique qu'un bouton qui ne fait rien.
 */
export default function BoutonGoogle() {
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function continuer() {
    setErreur(null);
    setEnvoi(true);

    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });

    if (error) {
      setErreur(
        "La connexion par Google n'est pas encore configurée. Utilisez votre adresse e-mail.",
      );
      setEnvoi(false);
    }
  }

  return (
    <>
      <div className="separateur-ou">ou</div>

      <button
        type="button"
        className="bouton bouton--pleine-largeur"
        onClick={continuer}
        disabled={envoi}
      >
        {envoi ? 'Redirection…' : 'Continuer avec Google'}
      </button>

      {erreur && <span className="erreur-champ">{erreur}</span>}
    </>
  );
}
