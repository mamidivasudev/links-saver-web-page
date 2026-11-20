// Gathers the web pages into ./app so the desktop app (and the packaged .exe) carry their own copy.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(__dirname, 'app');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const f of ['MyLinks.html', 'save-notes.html']) fs.copyFileSync(path.join(root, f), path.join(out, f));
fs.cpSync(path.join(root, 'vendor'), path.join(out, 'vendor'), { recursive: true });
for (const f of ['shell.html', 'prompt.html']) fs.copyFileSync(path.join(__dirname, 'shell', f), path.join(out, f));

console.log('app/ ready:', fs.readdirSync(out).join(', '));
