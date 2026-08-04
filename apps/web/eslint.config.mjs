// eslint-config-next 16 fournit directement des configurations « plates » :
// pas besoin de FlatCompat ni du format historique.
import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

const configuration = [
  ...coreWebVitals,
  ...typescript,
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'] },
];

export default configuration;
