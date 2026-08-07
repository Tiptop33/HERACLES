import { redirect } from 'next/navigation';

/**
 * L'ancienne liste « Mes candidats » — un tableau de sept colonnes, et rien de
 * ce qu'un référent ouvrait ensuite.
 *
 * Le poste de travail (maquette 1c) la remplace : la même liste, mais la fiche
 * s'ouvre à côté au lieu de faire changer de page. Une redirection plutôt
 * qu'une suppression, parce que l'adresse traîne dans des favoris et dans les
 * courriels d'invitation déjà partis.
 */
export default function MesCandidats() {
  redirect('/espace/candidats?vue=suivis');
}
