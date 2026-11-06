import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { createServer } from 'vite'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const vite = await createServer({
  configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
  root: appRoot,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

try {
  const { default: App } = await vite.ssrLoadModule('/src/App.tsx')
  const content = renderToString(createElement(App))
  const outputPath = new URL('../dist/index.html', import.meta.url)
  const html = await readFile(outputPath, 'utf8')
  const appShell = '<div id="root"></div>'

  if (!html.includes(appShell)) {
    throw new Error('Could not find the app root in dist/index.html to prerender.')
  }

  await writeFile(outputPath, html.replace(appShell, `<div id="root">${content}</div>`))
  console.log('Prerendered landing page into dist/index.html')
} finally {
  await vite.close()
}
