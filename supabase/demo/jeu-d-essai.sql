-- Jeu d'essai — des personnes entièrement inventées.
--
-- À jouer sur une base LOCALE, pour essayer l'espace référent sans toucher aux
-- vraies fiches. Rejouable : tout est en `on conflict do nothing`.
--
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54332 -U postgres -d postgres \
--     -f supabase/demo/jeu-d-essai.sql
--
-- Il est bâti pour qu'on puisse éprouver l'isolation soi-même, et pas seulement
-- la croire sur parole. Les comptes se créent avec `node outils/comptes-essai.mjs`
-- — l'inscription libre est fermée depuis la migration 0009 :
--
--   patron@example.org   → administrateur : le seul à pouvoir inviter
--   bernard@example.org  → loge de Bordeaux, référent de 5 candidats
--   claire@example.org   → loge de Toulouse, référente de 2 autres
--   michel@example.org   → parrain d'Alice et de Théo, et de personne d'autre
--
-- L'adresse suffit : à la création du compte, celui-ci rejoint la fiche de
-- référent qui porte la même (migration 0006). Connectez-vous avec l'un, puis
-- avec l'autre :
-- les deux listes n'ont aucun candidat en commun. Et l'adresse d'une fiche de
-- Claire, recopiée dans le navigateur de Bernard, ne donne rien — ce n'est pas
-- la page qui refuse, c'est la base.

-- ---------------------------------------------------------------------------
-- Deux loges
-- ---------------------------------------------------------------------------
insert into public.loge (bubble_id, nom, lieu_reunions) values
  ('demo-loge-bordeaux', 'Bordeaux', 'Maison des associations'),
  ('demo-loge-toulouse', 'Toulouse', 'Salle Jean-Jaurès')
on conflict (bubble_id) do nothing;

-- ---------------------------------------------------------------------------
-- Trois personnes qui accompagnent
-- ---------------------------------------------------------------------------
insert into public.referent (bubble_id, nom, prenom, email, telephone, loge_id) values
  ('demo-ref-bernard', 'Delorme', 'Bernard', 'bernard@example.org', '06 01 02 03 04',
     (select id from public.loge where bubble_id = 'demo-loge-bordeaux')),
  ('demo-ref-michel',  'Aubert',  'Michel',  'michel@example.org',  '06 05 06 07 08',
     (select id from public.loge where bubble_id = 'demo-loge-bordeaux')),
  ('demo-ref-claire',  'Vasseur', 'Claire',  'claire@example.org',  '06 09 10 11 12',
     (select id from public.loge where bubble_id = 'demo-loge-toulouse'))
on conflict (bubble_id) do nothing;

-- ---------------------------------------------------------------------------
-- Sept candidats, à des états d'avancement volontairement différents
-- ---------------------------------------------------------------------------
insert into public.candidat
  (bubble_id, numero, nom, prenom, email, telephone, age, situation_familiale,
   ville, code_postal, type_emploi, emploi_recherche, mobilite_geographique,
   debut_stage, secteur_activite_libelle, formations, experiences, competences,
   savoir_etre, informatique, permis_vl, vehicule, appreciation, cloture,
   cv_url, lettre_motivation_url, loge_id, referent_id, parrain_id, cree_le, maj_le)
values
  -- Fiche presque complète, suivie de près.
  ('demo-cand-alice', 108, 'Martin', 'Alice', 'a.martin@example.org', '07 65 73 03 85', 33,
   'Mariée, 2 enfants', 'Bordeaux', '33000', 'Alternance', 'Assistante comptable',
   'Bordeaux Métropole', '2026-09-01', 'Comptabilité, gestion',
   'BTS Comptabilité et gestion (2014) · Titre professionnel Assistante de gestion (2019)',
   'Six ans en cabinet comptable, puis trois ans en PME du bâtiment : saisie, rapprochements bancaires, déclarations de TVA, préparation des bilans.',
   'Sage, Cegid', 'Rigoureuse, Autonome', 'Excel avancé', 'Permis B', 'véhiculée',
   'Très motivée', null, 'https://exemple.test/cv-alice.pdf', 'https://exemple.test/lm-alice.pdf',
   (select id from public.loge where bubble_id = 'demo-loge-bordeaux'),
   (select id from public.referent where bubble_id = 'demo-ref-bernard'),
   (select id from public.referent where bubble_id = 'demo-ref-michel'),
   now() - interval '5 months', now() - interval '2 days'),

  -- Fiche très complète, vue hier.
  ('demo-cand-paul', 99, 'Dubois', 'Paul', 'p.dubois@example.org', '06 55 44 33 22', 47,
   'Marié', 'Pessac', '33600', 'Emploi', 'Technicien de maintenance',
   'Nouvelle-Aquitaine', '2026-10-01', 'Maintenance industrielle',
   'Bac professionnel Maintenance des équipements industriels',
   'Vingt ans en industrie papetière : maintenance préventive et curative, dépannage en équipe postée.',
   'Hydraulique, Pneumatique, Automatisme', 'Méthodique, Fiable', 'GMAO',
   'Permis B', 'véhiculé', 'Excellent profil, disponible vite', null,
   'https://exemple.test/cv-paul.pdf', 'https://exemple.test/lm-paul.pdf',
   (select id from public.loge where bubble_id = 'demo-loge-bordeaux'),
   (select id from public.referent where bubble_id = 'demo-ref-bernard'), null,
   now() - interval '7 months', now() - interval '1 day'),

  -- Fiche moyenne.
  ('demo-cand-karim', 106, 'Benali', 'Karim', 'k.benali@example.org', '06 11 22 33 44', 24,
   null, 'Mérignac', '33700', 'Emploi', 'Préparateur de commandes', 'Gironde',
   null, 'Logistique', 'CAP Opérateur logistique',
   'Trois ans en entrepôt : réception, préparation, inventaires.',
   'CACES 1-3-5', 'Ponctuel, Endurant', null, 'Permis B', null, null, null,
   'https://exemple.test/cv-karim.pdf', null,
   (select id from public.loge where bubble_id = 'demo-loge-bordeaux'),
   (select id from public.referent where bubble_id = 'demo-ref-bernard'), null,
   now() - interval '3 months', now() - interval '5 days'),

  -- Jamais retouchée depuis sa création : « À contacter », « jamais ».
  ('demo-cand-sophie', 104, 'Lemaire', 'Sophie', null, null, 19, null,
   'Talence', null, 'Stage', null, null, null, 'Communication',
   null, null, null, null, null, null, null, null, null, null, null,
   (select id from public.loge where bubble_id = 'demo-loge-bordeaux'),
   (select id from public.referent where bubble_id = 'demo-ref-bernard'), null,
   now() - interval '3 days', now() - interval '3 days'),

  -- Clôturée : « Clôturé — embauché ».
  ('demo-cand-nadia', 91, 'Fournier', 'Nadia', 'n.fournier@example.org', '07 88 99 00 11', 29,
   null, 'Bègles', '33130', 'Alternance', 'Chargée de recrutement', 'Bordeaux',
   null, 'Ressources humaines', 'Licence professionnelle Ressources humaines',
   'Deux ans en cabinet de recrutement : sourcing, entretiens de préqualification.',
   'Sourcing, Entretien', 'À l''écoute, Organisée', 'Suite Office',
   'Permis B', null, 'Embauchée en juin', 'Embauché',
   'https://exemple.test/cv-nadia.pdf', null,
   (select id from public.loge where bubble_id = 'demo-loge-bordeaux'),
   (select id from public.referent where bubble_id = 'demo-ref-bernard'), null,
   now() - interval '9 months', now() - interval '35 days'),

  -- Chez Claire, à Toulouse. Michel en est le parrain : il le verra, Bernard non.
  ('demo-cand-theo', 103, 'Roussel', 'Théo', 't.roussel@example.org', '06 44 55 66 77', 21,
   'Célibataire', 'Toulouse', '31000', 'Alternance', 'Développeur web',
   'Toulouse et alentours', '2026-09-15', 'Informatique',
   'BUT Informatique (2e année)',
   'Un stage de trois mois dans une agence web : intégration de maquettes, corrections de bogues.',
   'HTML, CSS, JavaScript', 'Curieux, Persévérant', 'Git, VS Code', 'Permis B', null,
   'Sérieux, à suivre', null, 'https://exemple.test/cv-theo.pdf', null,
   (select id from public.loge where bubble_id = 'demo-loge-toulouse'),
   (select id from public.referent where bubble_id = 'demo-ref-claire'),
   (select id from public.referent where bubble_id = 'demo-ref-michel'),
   now() - interval '2 months', now() - interval '4 days'),

  -- Chez Claire seulement : ni Bernard ni Michel ne doivent la voir.
  ('demo-cand-lucie', 101, 'Garnier', 'Lucie', 'l.garnier@example.org', '07 33 22 11 00', 38,
   'Divorcée, 1 enfant', 'Blagnac', '31700', 'Emploi', 'Agente administrative',
   'Toulouse', null, 'Administration',
   'BTS Assistant de gestion',
   'Dix ans en secrétariat médical : accueil, planning, facturation.',
   'Frappe rapide, Facturation', 'Discrète, Fiable', 'Word, Excel',
   'Permis B', 'véhiculée', null, null, null, null,
   (select id from public.loge where bubble_id = 'demo-loge-toulouse'),
   (select id from public.referent where bubble_id = 'demo-ref-claire'), null,
   now() - interval '4 months', now() - interval '12 days')
on conflict (bubble_id) do nothing;

-- ---------------------------------------------------------------------------
-- Rattacher les comptes déjà créés
--   Si vous avez inscrit bernard@example.org AVANT de jouer ce fichier, le
--   rattachement automatique n'avait aucune fiche à trouver. Cette boucle
--   rattrape le coup — et ne fait rien si tout est déjà en place.
-- ---------------------------------------------------------------------------
do $$
declare
  compte record;
begin
  for compte in select u.id, u.email from auth.users u where u.email is not null
  loop
    perform public.rattacher_referent_au_compte(compte.id, compte.email);
  end loop;
end
$$;


-- ---------------------------------------------------------------------------
-- Quatre candidats que personne n'accompagne encore
--   C'est le bloc « Urgences — nouvelles demandes » de l'accueil : les fiches
--   de la loge dont ni référent ni parrain n'a la charge. Une par famille de
--   recherche, pour que les trois pastilles portent chacune un chiffre.
-- ---------------------------------------------------------------------------
insert into public.candidat
  (bubble_id, numero, nom, prenom, email, telephone, age, ville, code_postal,
   type_emploi, emploi_recherche, loge_id, cree_le, maj_le)
values
  ('demo-cand-attente-1', 120, 'Roussel', 'Emma', 'e.roussel@example.org',
   '06 12 34 56 78', 24, 'Bordeaux', '33000', 'Emploi', 'Assistante administrative',
   (select id from public.loge where bubble_id = 'demo-loge-bordeaux'),
   now() - interval '3 days', now() - interval '3 days'),

  ('demo-cand-attente-2', 121, 'Berger', 'Alix', 'a.berger@example.org',
   '06 23 45 67 89', 19, 'Talence', '33400', 'Alternance', 'Vente et commerce',
   (select id from public.loge where bubble_id = 'demo-loge-bordeaux'),
   now() - interval '2 days', now() - interval '2 days'),

  ('demo-cand-attente-3', 122, 'Nguyen', 'Sacha', 's.nguyen@example.org',
   '06 34 56 78 90', 21, 'Pessac', '33600', 'Stage', 'Informatique',
   (select id from public.loge where bubble_id = 'demo-loge-bordeaux'),
   now() - interval '1 day', now() - interval '1 day'),

  -- Celui-ci est à Toulouse : il ne doit jamais apparaître chez Bernard.
  ('demo-cand-attente-4', 123, 'Perrin', 'Malo', 'm.perrin@example.org',
   '06 45 67 89 01', 28, 'Toulouse', '31000', 'Emploi', 'Magasinier',
   (select id from public.loge where bubble_id = 'demo-loge-toulouse'),
   now(), now())
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Des comptes-rendus et des affiches, une loge chacun
--   L'accueil ne montre à chacun que ceux de sa loge (migration 0011). Deux
--   loges, deux séries : de quoi le vérifier soi-même en changeant de compte.
-- ---------------------------------------------------------------------------
insert into public.document (bubble_id, nom, type_document, lien_url, loge_id, cree_le)
values
  ('demo-doc-b1', 'Compte-rendu de la réunion 23', 'Compte-rendu',
   'https://exemple.test/cr-23.pdf',
   (select id from public.loge where bubble_id = 'demo-loge-bordeaux'), now() - interval '8 days'),
  ('demo-doc-b2', 'Affiche du forum de septembre', 'Affiche',
   'https://exemple.test/forum.pdf',
   (select id from public.loge where bubble_id = 'demo-loge-bordeaux'), now() - interval '20 days'),
  ('demo-doc-b3', 'Bilan de la saison 2024-2025', 'Bilan',
   'https://exemple.test/bilan.pdf',
   (select id from public.loge where bubble_id = 'demo-loge-bordeaux'), now() - interval '3 months'),
  ('demo-doc-t1', 'Compte-rendu de la réunion 12', 'Compte-rendu',
   'https://exemple.test/cr-12.pdf',
   (select id from public.loge where bubble_id = 'demo-loge-toulouse'), now() - interval '5 days')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Quelques offres, actualisées récemment
--   « En cours » veut dire actualisée depuis moins de trente jours : au-delà,
--   une offre est presque toujours pourvue, et la proposer fait perdre son
--   temps à tout le monde. La dernière est vieille exprès — elle ne doit pas
--   apparaître.
-- ---------------------------------------------------------------------------
insert into public.offre_emploi
  (bubble_id, intitule, entreprise_nom, lieu_libelle, type_contrat_libelle,
   date_creation, date_actualisation)
values
  ('demo-offre-1', 'Assistant administratif (H/F)', 'Groupe Vidal', 'Bordeaux', 'CDD',
   now() - interval '10 days', now() - interval '2 days'),
  ('demo-offre-2', 'Technicien de maintenance', 'Aquitaine Services', 'Mérignac', 'CDI',
   now() - interval '15 days', now() - interval '5 days'),
  ('demo-offre-3', 'Magasinier cariste', 'Logistique du Sud-Ouest', 'Toulouse', 'Intérim',
   now() - interval '20 days', now() - interval '9 days'),
  ('demo-offre-ancienne', 'Offre expirée, ne doit pas s''afficher', 'Vieille Enseigne',
   'Bordeaux', 'CDD', now() - interval '8 months', now() - interval '7 months')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Un administrateur, pour éprouver les invitations
--   Seul un administrateur peut inviter (migration 0009). Le rôle « admin » ne
--   se choisit pas à l'inscription : on le pose ici, ce que seule la clé
--   d'administration peut faire.
-- ---------------------------------------------------------------------------
update public.profil set role = 'admin'
 where id in (select id from auth.users where lower(email) = 'patron@example.org');

-- ---------------------------------------------------------------------------
-- Ce qui a été posé
-- ---------------------------------------------------------------------------
select r.prenom || ' ' || r.nom            as referent,
       l.nom                                as loge,
       count(*) filter (where c.referent_id = r.id) as "suit",
       count(*) filter (where c.parrain_id  = r.id) as "parraine",
       case when r.profil_id is null then 'compte à créer' else 'compte rattaché' end as etat
  from public.referent r
  left join public.loge l on l.id = r.loge_id
  left join public.candidat c on c.referent_id = r.id or c.parrain_id = r.id
 where r.bubble_id like 'demo-ref-%'
 group by r.id, r.prenom, r.nom, l.nom, r.profil_id
 order by r.nom;
