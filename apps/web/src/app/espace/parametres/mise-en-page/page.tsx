import { redirect } from 'next/navigation';
import { ADRESSES } from '@/lib/documents/gabarits';

/** La rubrique s'ouvre sur son premier document : le compte rendu. */
export default function MiseEnPage() {
  redirect(`/espace/parametres/mise-en-page/${ADRESSES.compte_rendu}`);
}
