import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { empreinte, lireInvitation } from '@/lib/invitation';
import { premiereFaute } from '@/lib/motdepasse';
import { accueilDuRole } from '@/lib/roles';

const Reponse = z.discriminatedUnion('reponse', [
  z.object({ reponse: z.literal('refuser') }),
  z.object({
    reponse: z.literal('accepter'),
    prenom: z.string().trim().min(1, 'Le prénom est requis.'),
    nom: z.string().trim().min(1, 'Le nom est requis.'),
    motDePasse: z.string().min(1),
  }),
]);

export async function POST(requete: Request, { params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;

  const brut = await requete.json().catch(() => null);
  const lu = Reponse.safeParse(brut);
  if (!lu.success) {
    const souci = lu.error.issues[0];
    return NextResponse.json(
      {
        erreur: souci?.message ?? 'Formulaire invalide.',
        champ: typeof souci?.path?.[0] === 'string' ? souci.path[0] : null,
      },
      { status: 400 },
    );
  }

  const invitation = await lireInvitation(jeton);
  if (!invitation || !invitation.valable) {
    return NextResponse.json({ erreur: "Cette invitation n'est plus valable." }, { status: 410 });
  }

  const admin = supabaseAdmin();

  if (lu.data.reponse === 'refuser') {
    await admin.rpc('refuser_invitation', { empreinte: empreinte(jeton) });
    return NextResponse.json({ ok: true, redirection: '/connexion' });
  }

  const faute = premiereFaute(lu.data.motDePasse);
  if (faute) {
    return NextResponse.json({ erreur: faute, champ: 'motDePasse' }, { status: 400 });
  }

  // C'est le jeton qui identifie, pas une session : il n'a été envoyé qu'à une
  // seule boîte mail, il ne sert qu'une fois et il expire. Le compte visé, lui,
  // est celui que porte l'invitation — jamais celui que demanderait le
  // navigateur, sans quoi un lien suffirait à s'emparer d'un autre compte.
  const { data: compte } = await admin.rpc('compte_par_email', { adresse: invitation.email });
  if (!compte) {
    return NextResponse.json(
      { erreur: "Le compte lié à cette invitation est introuvable." },
      { status: 409 },
    );
  }

  const { error: souciMotDePasse } = await admin.auth.admin.updateUserById(compte as string, {
    password: lu.data.motDePasse,
    email_confirm: true,
  });
  if (souciMotDePasse) {
    return NextResponse.json(
      { erreur: "Le mot de passe n'a pas pu être enregistré.", champ: 'motDePasse' },
      { status: 400 },
    );
  }

  const { error: souci } = await admin.rpc('accepter_invitation', {
    empreinte: empreinte(jeton),
    compte,
    prenom_donne: lu.data.prenom,
    nom_donne: lu.data.nom,
  });

  if (souci) {
    return NextResponse.json(
      { erreur: 'Cette invitation ne correspond pas à ce compte.' },
      { status: 403 },
    );
  }

  await admin.rpc('retenir_mot_de_passe', { compte, clair: lu.data.motDePasse });

  // Le compte est prêt : on ouvre la session dans la foulée, pour que la
  // personne n'ait pas à ressaisir ce qu'elle vient de choisir.
  const supabase = await supabaseServer();
  await supabase.auth.signInWithPassword({
    email: invitation.email,
    password: lu.data.motDePasse,
  });

  return NextResponse.json({ ok: true, redirection: accueilDuRole(invitation.role) });
}
