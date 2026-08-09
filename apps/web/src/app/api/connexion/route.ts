import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase-server';
import { jeMeConnecte } from '@/lib/presence';
import { accueilDuRole } from '@/lib/roles';
import {
  destinationInterne,
  lireCorps,
  origine,
  retourAvecCode,
  vientDUnFormulaire,
} from '@/lib/formulaire';

const Formulaire = z.object({
  email: z.email("L'adresse e-mail n'est pas valide."),
  motDePasse: z.string().min(1, 'Le mot de passe est requis.'),
  // Case « Rester connecté ». Cochée par défaut ; décochée, la session meurt
  // avec le navigateur.
  rester: z.string().optional(),
});

export async function POST(requete: Request) {
  // Sans JavaScript — ou avant la fin de l'hydratation — le navigateur envoie
  // le formulaire lui-même. On répond alors par une redirection plutôt que par
  // du JSON, sinon la personne verrait s'afficher `{"ok":true}`.
  const natif = vientDUnFormulaire(requete);
  const brut = await lireCorps(requete);
  const lu = Formulaire.safeParse(brut);

  const suite = destinationInterne(brut?.suite);

  if (!lu.success) {
    if (natif) return retourAvecCode(requete, '/connexion', { erreur: 'formulaire', suite });
    const souci = lu.error.issues[0];
    return NextResponse.json(
      {
        erreur: souci?.message ?? 'Formulaire incomplet.',
        // Le champ fautif voyage avec le message : la page l'affiche sous
        // celui-là, et pas dans une fenêtre surgissante.
        champ: souci?.path?.[0] === 'motDePasse' ? 'motDePasse' : 'email',
      },
      { status: 400 },
    );
  }

  const supabase = await supabaseServer({ sessionNavigateur: !lu.data.rester });
  const { data, error } = await supabase.auth.signInWithPassword({
    email: lu.data.email,
    password: lu.data.motDePasse,
  });

  if (error || !data.user) {
    // Un seul message pour « adresse inconnue » et « mot de passe faux » :
    // sinon le formulaire dit qui est inscrit.
    if (natif) return retourAvecCode(requete, '/connexion', { erreur: 'identifiants', suite });
    return NextResponse.json(
      { erreur: 'Adresse e-mail ou mot de passe incorrect.', champ: 'motDePasse' },
      { status: 401 },
    );
  }

  // La session est ouverte : les collègues de la loge le verront dans leur
  // colonne de gauche (migration 0042).
  await jeMeConnecte();

  // La RLS ne laisse lire que sa propre ligne : pas de filtre à écrire ici.
  const { data: profil } = await supabase.from('profil').select('role').single();
  const accueil = accueilDuRole(profil?.role);

  // Une page demandée avant la connexion l'emporte sur l'accueil du rôle, à
  // condition qu'elle soit interne au site.
  if (natif) {
    return NextResponse.redirect(new URL(suite ?? accueil, origine(requete)), 303);
  }

  return NextResponse.json({ ok: true, redirection: accueil });
}
