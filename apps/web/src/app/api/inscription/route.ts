import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase-server';
import { ROLES_INSCRIPTION } from '@/lib/roles';
import { lireCorps, retourAvecCode, vientDUnFormulaire } from '@/lib/formulaire';

const Formulaire = z.object({
  role: z.enum(ROLES_INSCRIPTION),
  email: z.email("L'adresse email n'est pas valide."),
  motDePasse: z.string().min(8, 'Le mot de passe doit faire au moins 8 caractères.'),
  nom: z.string().trim().min(1, 'Le nom est requis.'),
  prenom: z.string().trim().min(1, 'Le prénom est requis.'),
});

export async function POST(requete: Request) {
  // Même raison qu'à la connexion : tant que JavaScript n'a pas pris la main,
  // c'est le navigateur qui envoie le formulaire — et un envoi en GET écrirait
  // le mot de passe choisi dans l'adresse.
  const natif = vientDUnFormulaire(requete);
  const brut = await lireCorps(requete);
  const lu = Formulaire.safeParse(brut);

  if (!lu.success) {
    if (natif) return retourAvecCode(requete, '/inscription', { erreur: 'formulaire' });
    const souci = lu.error.issues[0];
    return NextResponse.json(
      {
        erreur: souci?.message ?? 'Formulaire incomplet.',
        // Le champ fautif voyage avec le message : la page l'affiche sous
        // celui-là, et pas dans une fenêtre surgissante.
        champ: typeof souci?.path?.[0] === 'string' ? souci.path[0] : null,
      },
      { status: 400 },
    );
  }

  const { role, email, motDePasse, nom, prenom } = lu.data;
  const supabase = await supabaseServer();

  const { error } = await supabase.auth.signUp({
    email,
    password: motDePasse,
    options: {
      // Le rôle voyage dans les métadonnées : le déclencheur SQL le relit et
      // n'accepte que « chercheur » ou « referent ».
      data: { role, nom, prenom },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/auth/callback`,
    },
  });

  if (error) {
    // Message volontairement neutre : ne pas révéler si l'adresse existe déjà.
    const trop = error.status === 429;
    const message = trop
      ? 'Trop de tentatives. Réessayez dans quelques minutes.'
      : "L'inscription n'a pas abouti. Vérifiez l'adresse et réessayez.";

    if (natif) {
      return retourAvecCode(requete, '/inscription', { erreur: trop ? 'trop' : 'echec' });
    }
    return NextResponse.json({ erreur: message, champ: trop ? null : 'email' }, { status: 400 });
  }

  if (natif) return retourAvecCode(requete, '/inscription', { envoye: '1' });

  return NextResponse.json({ ok: true });
}
