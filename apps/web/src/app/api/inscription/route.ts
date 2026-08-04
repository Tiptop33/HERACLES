import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase-server';
import { ROLES_INSCRIPTION } from '@/lib/roles';

const Formulaire = z.object({
  role: z.enum(ROLES_INSCRIPTION),
  email: z.email("L'adresse email n'est pas valide."),
  motDePasse: z.string().min(8, 'Le mot de passe doit faire au moins 8 caractères.'),
  nom: z.string().trim().min(1, 'Le nom est requis.'),
  prenom: z.string().trim().min(1, 'Le prénom est requis.'),
});

export async function POST(requete: Request) {
  const brut = await requete.json().catch(() => null);
  const lu = Formulaire.safeParse(brut);

  if (!lu.success) {
    return NextResponse.json(
      { erreur: lu.error.issues[0]?.message ?? 'Formulaire incomplet.' },
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
    const message =
      error.status === 429
        ? 'Trop de tentatives. Réessayez dans quelques minutes.'
        : "L'inscription n'a pas abouti. Vérifiez l'adresse et réessayez.";
    return NextResponse.json({ erreur: message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
