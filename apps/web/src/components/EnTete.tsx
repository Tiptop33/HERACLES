import Link from 'next/link';
import { libelleDuRole } from '@/lib/roles';
import type { Profil } from '@/lib/profil';

export default function EnTete({ profil }: { profil: Profil }) {
  const nom = [profil.prenom, profil.nom].filter(Boolean).join(' ') || 'Mon compte';

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        flexWrap: 'wrap',
        borderBottom: '1px solid var(--bordure)',
        paddingBottom: '1rem',
        marginBottom: '2rem',
      }}
    >
      <div>
        <Link href="/" style={{ fontWeight: 700, textDecoration: 'none', color: 'inherit' }}>
          HERACLES
        </Link>
        <span className="discret"> · {libelleDuRole(profil.role)}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <Link href="/mon-compte">{nom}</Link>
        <form action="/api/deconnexion" method="post">
          <button
            type="submit"
            className="discret"
            style={{
              background: 'none',
              border: 0,
              padding: 0,
              font: 'inherit',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Se déconnecter
          </button>
        </form>
      </div>
    </header>
  );
}
