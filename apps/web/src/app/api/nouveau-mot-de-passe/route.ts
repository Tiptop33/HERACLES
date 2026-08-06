import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { accueilDuRole } from '@/lib/roles';
import { premiereFaute } from '@/lib/motdepasse';
import { lireCorps, origine, retourAvecCode, vientDUnFormulaire } from '@/lib/formulaire';

const Formulaire = z.object({
  motDePasse: z.string().min(1),
  confirmation: z.string().min(1),
});

/**
 * Une route qui lève renvoie une page d'erreur en HTML. Le navigateur, qui
 * attendait du JSON, n'y comprend rien et annonce « la connexion au serveur a
 * échoué » — un message qui désigne le réseau alors que la panne est dans la
 * configuration du serveur. On rend donc toute exception lisible.
 */
export async function POST(requete: Request) {
  try {
    return await traiter(requete);
  } catch (souci) {
    console.error('[nouveau-mot-de-passe] échec inattendu', souci);
    if (vientDUnFormulaire(requete)) {
      return retourAvecCode(requete, '/nouveau-mot-de-passe', { erreur: 'indisponible' });
    }
    return NextResponse.json(
      { erreur: 'Le service est momentanément indisponible. Réessayez dans un instant.' },
      { status: 503 },
    );
  }
}

async function traiter(requete: Request) {
  const natif = vientDUnFormulaire(requete);
  const brut = await lireCorps(requete);
  const lu = Formulaire.safeParse(brut);

  const refuser = (code: string, champ: string | null, message: string, statut = 400) => {
    if (natif) return retourAvecCode(requete, '/nouveau-mot-de-passe', { erreur: code });
    return NextResponse.json({ erreur: message, champ }, { status: statut });
  };

  if (!lu.success) {
    return refuser('formulaire', 'motDePasse', 'Formulaire incomplet.');
  }

  const { motDePasse, confirmation } = lu.data;

  // 1. La session d'abord. On n'arrive ici qu'avec celle qu'ouvre le lien de
  //    réinitialisation ; sans elle, il n'y a personne dont changer le mot de
  //    passe.
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return refuser('expire', null, "Ce lien n'est plus valable. Demandez-en un nouveau.", 401);
  }

  // 2. Les mêmes règles que celles affichées — un contrôle fait dans le
  //    navigateur renseigne, il ne protège pas.
  const faute = premiereFaute(motDePasse);
  if (faute) return refuser('regles', 'motDePasse', faute);
  if (motDePasse !== confirmation) {
    return refuser('confirmation', 'confirmation', 'Les deux mots de passe diffèrent.');
  }

  // 3. Session vérifiée, règles tenues : alors seulement la clé service_role,
  //    seule à pouvoir consulter les empreintes des anciens mots de passe.
  const admin = supabaseAdmin();
  const { data: dejaVu, error: souciControle } = await admin.rpc('mot_de_passe_deja_utilise', {
    compte: user.id,
    clair: motDePasse,
  });

  // Si le contrôle lui-même échoue, on refuse. Laisser passer parce qu'on n'a
  // pas pu vérifier reviendrait à n'avoir aucune règle le jour où la base
  // bronche — c'est exactement quand elle doit tenir.
  if (souciControle) {
    return refuser(
      'echec',
      null,
      "Le mot de passe n'a pas pu être vérifié. Réessayez dans un instant.",
      503,
    );
  }

  if (dejaVu) {
    return refuser(
      'reutilise',
      'motDePasse',
      'Ce mot de passe est l’un des trois derniers que vous avez utilisés.',
    );
  }

  const { error } = await supabase.auth.updateUser({ password: motDePasse });
  if (error) {
    return refuser('echec', 'motDePasse', "L'enregistrement a échoué. Réessayez.");
  }

  // Retenu seulement après coup : mémoriser un mot de passe que Supabase aurait
  // refusé rendrait la règle fausse.
  await admin.rpc('retenir_mot_de_passe', { compte: user.id, clair: motDePasse });

  const { data: profil } = await supabase.from('profil').select('role').single();
  const accueil = accueilDuRole(profil?.role);

  if (natif) return NextResponse.redirect(new URL(accueil, origine(requete)), 303);
  return NextResponse.json({ ok: true, redirection: accueil });
}
