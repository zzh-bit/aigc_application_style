import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'out/**',
      // UniApp 壳构建产物/拷贝产物不参与 Web 工程 lint
      'uniapp-shell/unpackage/**',
      'uniapp-shell/hybrid/**',
      'uniapp-shell/src/hybrid/**',
    ],
  },
  ...nextCoreWebVitals,
]

export default config
