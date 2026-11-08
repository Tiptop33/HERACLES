import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Image autonome : le conteneur de production n'embarque que le nécessaire.
  output: 'standalone',

  // L'espace « chercheur » s'appelle « candidat » depuis la migration 0059.
  // Un favori ou un vieux courriel qui pointe encore l'ancienne adresse ne doit
  // pas tomber sur une page introuvable.
  async redirects() {
    return [{ source: '/espace/chercheur', destination: '/espace/candidat', permanent: true }];
  },
};

export default nextConfig;
