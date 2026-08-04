import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Image autonome : le conteneur de production n'embarque que le nécessaire.
  output: 'standalone',
};

export default nextConfig;
