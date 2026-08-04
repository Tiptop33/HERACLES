import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase-server';
import { accueilDuRole } from '@/lib/roles';

const Formulaire = z.object({
  email: z.email("L'adresse email n'est pas valide."),
  motDePasse: z.string().min(1, 'Le mot de passe est requis.'),
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

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: lu.data.email,
    password: lu.data.motDePasse,
  });

  if (error || !data.user) {
    // Un seul message pour « adresse inconnue » et « mot de passe faux » :
    // sinon le formulaire dit qui est inscrit.
    return NextResponse.json(
      { erreur: 'Adresse email ou mot de passe incorrect.' },
      { status: 401 },
    );
  }

  // La RLS ne laisse lire que sa propre ligne : pas de filtre à écrire ici.
  const { data: profil } = await supabase.from('profil').select('role').single();

  return NextResponse.json({ ok: true, redirection: accueilDuRole(profil?.role) });
}
