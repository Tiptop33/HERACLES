import { redirect } from 'next/navigation';
import { adresseDeLEcusson, initialeDeProvince, nomAffiche } from '@/lib/provinces';
import { listerProvinces, provincesAGerer } from '@/lib/provinces-serveur';
import { exigerProfil } from '@/lib/profil';
import { accueilDuRole } from '@/lib/roles';
import GestionDesProvinces from './GestionDesProvinces';

export const metadata = { title: 'Province — HERACLES' };

/**
 * L'écran « Province » : une carte par province, son écusson puis son nom.
 *
 * Ce que l'écran montre vient de la base, sous RLS (migration 0080) : les
 * référents et l'administration voient toutes les provinces. Un compte
 * chercheur n'a pas cet écran — il est renvoyé chez lui, comme pour les
 * autres écrans de l'espace de travail.
 *
 * L'administration y gère aussi les provinces — ajouter, renommer, déposer
 * l'écusson, retirer (migration 0096, décisions du 13 novembre 2026). Les
 * référents voient les mêmes cartes, sans aucun geste.
 */
export default async function Provinces() {
  const profil = await exigerProfil();
  if (profil.role === 'chercheur') redirect(accueilDuRole(profil.role));

  if (profil.role === 'admin') {
    const provinces = await provincesAGerer();
    return (
      <main className="corps">
        <div className="entete-liste">
          <div>
            <h1>Province</h1>
          </div>
        </div>
        {provinces ? (
          <GestionDesProvinces initiales={provinces} />
        ) : (
          <p className="erreur" role="alert">
            La liste des provinces n’a pas pu être lue. Réessayez dans un instant.
          </p>
        )}
      </main>
    );
  }

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
          {provinces.map((p) => (
            <article key={p.id} className="carte-province">
              <div className="carte-province-image">
                {/* L'écusson, servi sous contrôle d'accès. `alt` vide : le
                    nom est juste en dessous. Faute d'écusson, l'initiale —
                    comme les initiales d'un référent sans photo dans
                    l'annuaire. L'adresse porte la date de mise à jour : un
                    écusson remplacé n'est pas resservi depuis le cache. */}
                {p.a_un_ecusson ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={adresseDeLEcusson(p.id, p.version)} alt="" loading="lazy" />
                ) : (
                  <span className="carte-province-initiale" aria-hidden="true">
                    {initialeDeProvince(p.nom_de_la_province)}
                  </span>
                )}
              </div>
              <p className="carte-province-nom">{nomAffiche(p.nom_de_la_province)}</p>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
