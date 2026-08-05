import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase-server';
import { lireCorps, retourAvecCode, vientDUnFormulaire } from '@/lib/formulaire';

const Formulaire = z.object({
  email: z.email("L'adresse e-mail n'est pas valide."),
});

export async function POST(requete: Request) {
  const natif = vientDUnFormulaire(requete);
  const brut = await lireCorps(requete);
  const lu = Formulaire.safeParse(brut);

  if (!lu.success) {
    if (natif) return retourAvecCode(requete, '/mot-de-passe-oublie', { erreur: 'formulaire' });
    return NextResponse.json({ erreur: "L'adresse e-mail n'est pas valide." }, { status: 400 });
  }

  const supabase = await supabaseServer();
  await supabase.auth.resetPasswordForEmail(lu.data.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/auth/callback`,
  });

  // La réponse est la même que l'adresse soit inscrite ou non — et l'erreur
  // éventuelle de Supabase est délibérément ignorée. Répondre « adresse
  // inconnue » transformerait ce formulaire en annuaire des comptes.
  if (natif) return retourAvecCode(requete, '/mot-de-passe-oublie', { envoye: '1' });

  return NextResponse.json({ ok: true });
}
