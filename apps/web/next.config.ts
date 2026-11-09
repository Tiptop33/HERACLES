import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Image autonome : le conteneur de production n'embarque que le nécessaire.
  output: 'standalone',

  // pdfmake (et pdfkit qu'il tire) lisent leurs propres fichiers sur le disque
  // à côté de leur code : on les laisse dans `node_modules` plutôt que de les
  // faire passer par le bundler, qui ne les suivrait pas.
  serverExternalPackages: ['pdfmake'],

  // Les polices et les emblèmes d'origine des documents de la commission ne
  // sont importés par aucun module : il faut dire au traçage de les copier dans
  // l'image, à côté des routes qui produisent les PDF.
  outputFileTracingIncludes: {
    '/api/**': ['./src/lib/documents/ressources/**/*'],
  },
};

export default nextConfig;
