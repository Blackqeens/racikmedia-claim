'use strict';

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const outputDirectory = path.resolve(projectRoot, 'dist');
<<<<<<< HEAD
const publicFiles = ['index.html', 'login.html', 'script.js', 'style.css'];
=======
const publicFiles = ['index.html', 'script.js', 'style.css'];
>>>>>>> d19f01dd6bf34101acb004d32d061b0d1ce04dbd
const publicDirectories = ['api', 'assets', 'layouts', 'pages', 'articles', 'etalase', 'cerita-kami', 'events', 'kebijakan'];
const excludedFiles = new Set(['google-maps-config.js']);

if (!outputDirectory.startsWith(projectRoot + path.sep)) {
  throw new Error('Netlify output directory must stay inside the project.');
}

fs.rmSync(outputDirectory, { recursive: true, force: true });
fs.mkdirSync(outputDirectory, { recursive: true });

for (const file of publicFiles) {
  const source = path.join(projectRoot, file);
  if (!fs.existsSync(source)) {
    throw new Error(`Required public file is missing: ${file}`);
  }
  fs.copyFileSync(source, path.join(outputDirectory, file));
}

for (const directory of publicDirectories) {
  const source = path.join(projectRoot, directory);
  if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
    throw new Error(`Required public directory is missing: ${directory}`);
  }
  fs.cpSync(source, path.join(outputDirectory, directory), {
    recursive: true,
    filter: (entry) => !excludedFiles.has(path.basename(entry))
  });
}

const requiredOutput = [
  'index.html',
  'login.html',
  'articles/index.html',
  'etalase/index.html',
  'cerita-kami/index.html',
  'events/index.html',
  'kebijakan/index.html',
  'assets/js/lang.js',
  'assets/js/public-layout.js',
  'assets/js/layout.js',
  'assets/js/supabase-config.js',
  'assets/js/newsletter.js',
  'assets/css/public-layout.css',
  'assets/brand/1.png',
  'layouts/_public-navbar.html',
  'layouts/_footer.html',
  'api/auth.js'
];

for (const file of requiredOutput) {
  if (!fs.existsSync(path.join(outputDirectory, file))) {
    throw new Error(`Required deployment artifact was not produced: ${file}`);
  }
}

console.log(`Netlify package ready: ${requiredOutput.length} required paths verified in dist (includes cerita-kami and events).`);
