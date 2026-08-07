import { redirect } from 'next/navigation';

/**
 * L'ancienne fiche pleine page. Elle vit désormais dans le volet de droite du
 * poste de travail, là où la liste ne disparaît pas.
 *
 * L'adresse reste valable — elle est celle que porte le lien « retour » des
 * anciens écrans, et celle qu'on s'envoie entre collègues.
 */
export default async function FicheCandidat({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/espace/candidats?fiche=${encodeURIComponent(id)}`);
}
