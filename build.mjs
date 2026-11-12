// Builds dist/index.html (one self-contained file) and dist/sw.js.
// Usage: node build.mjs   — needs esbuild, react and react-dom resolvable.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const nodePaths = ['/opt/npm-tools/node_modules', join(here, 'node_modules'), ...(process.env.NODE_PATH || '').split(':').filter(Boolean)];
const require = createRequire(join(nodePaths[0], 'x.js'));
const esbuild = require('esbuild');

const out = await esbuild.build({
  entryPoints: [join(here, 'src/main.jsx')],
  bundle: true, minify: true, write: false, format: 'iife', target: ['es2020'],
  jsx: 'automatic', nodePaths, define: { 'process.env.NODE_ENV': '"production"' }, legalComments: 'none',
});
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = (await esbuild.transform(readFileSync(join(here, 'src/styles.css'), 'utf8'), { loader: 'css', minify: true })).code;
const icon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' rx='9' fill='%23130f1f'/%3E%3Cpath d='M20 20c-3.500-4.800-6-7-9.500-7a7 7 0 100 14c3.500 0 6-2.200 9.500-7zm0 0c3.500 4.800 6 7 9.500 7a7 7 0 100-14c-3.500 0-6 2.200-9.500 7z' fill='none' stroke='%23b79cff' stroke-width='3'/%3E%3C/svg%3E";
const html = `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0d0a15">
<meta name="description" content="Loop — keep the thread. A personal system for commitments and their resolution.">
<title>Loop — Keep the thread</title>
<link rel="icon" href="${icon}">
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<noscript>Loop needs JavaScript to run.</noscript>
<script>${js}</script>
</body>
</html>
`;
mkdirSync(join(here, 'dist'), { recursive: true });
writeFileSync(join(here, 'dist/index.html'), html);
copyFileSync(join(here, 'sw.js'), join(here, 'dist/sw.js'));
console.log('dist/index.html', (html.length / 1024).toFixed(0) + ' KB');
