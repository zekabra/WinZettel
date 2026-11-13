import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'url'
import { readFileSync } from 'node:fs'
import { defineConfig, normalizePath, type ResolverFunction } from 'vite'
import svgr from 'vite-plugin-svgr'
import { configDefaults } from 'vitest/config'

import { pdfPreviewAssets } from './pdfPreviewAssets'

const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url))
const desktopSourceRoot = normalizePath(fileURLToPath(new URL('./src', import.meta.url)))
const rmeSourceRoot = normalizePath(
  fileURLToPath(new URL('../../packages/editor/src', import.meta.url)),
)
const zensSourceRoot = normalizePath(
  fileURLToPath(new URL('../../packages/zens/src', import.meta.url)),
)

// Tests execute workspace sources without rebuilding published artifacts. The
// editor owns a separate @/ namespace, so resolve it according to the importer.
const resolveTestWorkspaceAlias: ResolverFunction = function (
  this: ThisParameterType<ResolverFunction>,
  source,
  importer,
  options,
) {
  const target = importer?.startsWith(`${rmeSourceRoot}/`)
    ? `${rmeSourceRoot}${source.slice(desktopSourceRoot.length)}`
    : source
  return this.resolve(target, importer, { ...options, skipSelf: true })
}

export default defineConfig(async ({ command, mode }) => {
  const analyzePlugin =
    mode === 'analyze'
      ? (await import('rollup-plugin-visualizer')).visualizer({
          brotliSize: true,
          emitFile: true,
          filename: 'stats.html',
          gzipSize: true,
        })
      : null

  return {
    server: {
      port: 3000,
      strictPort: true,
      fs: {
        allow: [workspaceRoot],
      },
    },
    clearScreen: false,
    optimizeDeps: {
      // Keep linked workspace modules live so warm starts can reuse the cache
      // without retaining an old copy of their components or theme contexts.
      exclude: ['rme', 'zens', '@markflowy/theme'],
      // Discover the lazy history viewer before its first open, so loading a
      // version does not trigger dependency re-optimization mid-session.
      include: ['react-dom/server', '@codemirror/merge'],
    },
    plugins: [
      pdfPreviewAssets(),
      // Shared and Desktop styles import theme + utilities explicitly without
      // Tailwind's global preflight layer.
      tailwindcss(),
      react({
        babel: {
          plugins: [
            ['@babel/plugin-proposal-decorators', { legacy: true }],
            ['@babel/plugin-proposal-class-properties', { loose: true }],
            'babel-plugin-react-compiler',
          ],
        },
      }),
      svgr({
        svgrOptions: {
          exportType: 'default',
        },
      }),
      analyzePlugin,
    ],
    build: {
      minify: 'esbuild',
      sourcemap: false,
      rolldownOptions: {
        input: {
          app: fileURLToPath(new URL('./index.html', import.meta.url)),
          themePreview: fileURLToPath(new URL('./theme-preview.html', import.meta.url)),
        },
        output: {
          // Preserve dynamic-import subgraphs instead of pulling every dependency
          // into a single eagerly preloaded vendor chunk.
          codeSplitting: true,
        },
      },
    },
    define: {
      __MARKFLOWY_HOST_VERSION__: JSON.stringify(
        JSON.parse(readFileSync(new URL('./src-tauri/tauri.conf.json', import.meta.url), 'utf8'))
          .version,
      ),
    },
    resolve: {
      alias: [
        // Development consumes the same shared source as tests, including CSS.
        // Production still resolves the package's independently emitted output.
        ...(command === 'serve'
          ? [
              { find: /^zens\/esm\/(.*)$/, replacement: `${zensSourceRoot}/$1` },
              { find: /^zens$/, replacement: `${zensSourceRoot}/index.ts` },
              {
                find: /^@markflowy\/theme$/,
                replacement: fileURLToPath(
                  new URL('../../packages/theme/src/index.ts', import.meta.url),
                ),
              },
            ]
          : []),
        // Source alias keeps the authoring model available without rebuilding workspace packages.
        {
          find: '@markflowy/theme/semantic',
          replacement: fileURLToPath(
            new URL('../../packages/theme/src/semantic/index.ts', import.meta.url),
          ),
        },
        {
          find: '@',
          replacement: desktopSourceRoot,
          ...(mode === 'test' ? { customResolver: resolveTestWorkspaceAlias } : {}),
        },
        {
          find: /^@markflowy\/i18n$/,
          replacement: fileURLToPath(new URL('./src/i18n/index.ts', import.meta.url)),
        },
        {
          find: '@markflowy/i18n/desktop',
          replacement: fileURLToPath(
            new URL('../../packages/i18n/src/desktop.ts', import.meta.url),
          ),
        },
      ],
      dedupe: ['react', 'react-dom'],
    },
    test: {
      environment: 'happy-dom',
      reporters: ['verbose'],
      exclude: [...configDefaults.exclude],
      // Use the theme's ESM entry so real RME tests share CodeMirror's classes
      // instead of mixing the externalized CommonJS and ESM state packages.
      server: { deps: { inline: ['rme', '@drl990114/codemirror-themes'] } },
      alias: [
        { find: /^rme$/, replacement: `${rmeSourceRoot}/index.ts` },
        {
          find: '@drl990114/codemirror-themes',
          replacement: fileURLToPath(
            new URL(
              '../../node_modules/@drl990114/codemirror-themes/esm/index.js',
              import.meta.url,
            ),
          ),
        },
      ],
    },
  }
})
