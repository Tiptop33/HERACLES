import { redirect } from 'next/navigation';
import { initialeDeProvince, listerProvinces } from '@/lib/provinces';
import { exigerProfil } from '@/lib/profil';
import { accueilDuRole } from '@/lib/roles';

export const metadata = { title: 'Province — HERACLES' };

/**
 * L'écran « Province » : une carte par province, son image puis son nom.
 *
 * Ce que l'écran montre vient de la base, sous RLS (migration 0080) : les
 * référents et l'administration voient toutes les provinces. Un compte
 * chercheur n'a pas cet écran — il est renvoyé chez lui, comme pour les
 * autres écrans de l'espace de travail.
 */
export default async function Provinces() {
  const profil = await exigerProfil();
  if (profil.role === 'chercheur') redirect(accueilDuRole(profil.role));

  const provinces = await listerProvinces();

  return (
    <main className="corps">
      <div className="entete-liste">
        <div>
          <h1>Province</h1>
        </div>
      </div>

      {/* Une page vide laisserait croire à une panne. Tant que la reprise
          n'a pas apporté les provinces de Bubble, on le dit. */}
      {provinces.length === 0 && (
        <p className="vide-liste">
          Aucune province pour l&apos;instant. Elles arriveront avec la reprise des données de
          Bubble.
        </p>
      )}

      {provinces.length > 0 && (
        <div className="provinces">
          {provinces.map((p) => {
            const nom = p.nom?.trim() || 'Province sans nom';

            return (
              <article key={p.id} className="carte-province">
                <div className="carte-province-image">
                  {/* L'image rapatriée de Bubble, servie sous contrôle
                      d'accès. `alt` vide : le nom est juste en dessous.
                      Faute d'image rapatriée, l'initiale — comme les
                      initiales d'un référent sans photo dans l'annuaire. */}
                  {p.a_une_image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/espace/provinces/${p.id}/image`} alt="" loading="lazy" />
                  ) : (
                    <span className="carte-province-initiale" aria-hidden="true">
                      {initialeDeProvince(p.nom)}
                    </span>
                  )}
                </div>
                <p className="carte-province-nom">{nom}</p>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
