import { notFound, redirect } from 'next/navigation';
import BarreReferent from '@/components/BarreReferent';
import { lireCandidat, referentCourant } from '@/lib/candidat';
import { exigerProfil } from '@/lib/profil';
import { accueilDuRole } from '@/lib/roles';
import FormulaireCandidat from './FormulaireCandidat';

export const metadata = { title: 'Modifier une fiche — HERACLES' };

export default async function ModifierCandidat({ params }: { params: Promise<{ id: string }> }) {
  const profil = await exigerProfil();
  if (profil.role !== 'referent') redirect(accueilDuRole(profil.role));

  const { id } = await params;
  const [referent, candidat] = await Promise.all([referentCourant(), lireCandidat(id)]);

  if (!candidat) notFound();

  return (
    <>
      <BarreReferent profil={profil} loge={referent?.loge ?? null} />
      <FormulaireCandidat candidat={candidat} />
    </>
  );
}
