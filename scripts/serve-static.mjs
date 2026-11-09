// Локальний перегляд демо-збірки так, як її віддасть GitHub Pages: dist-demo/ за адресою /nails-demo/.
// Запуск: npm run preview:demo  →  http://localhost:4000/nails-demo/
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.resolve(ROOT, process.argv[2] || 'dist-demo');
const base = `/${(process.argv[3] || 'nails-demo').replace(/^\/+|\/+$/g, '')}/`;
const port = Number(process.env.PREVIEW_PORT) || 4000;

const app = express();
app.get('/', (req, res) => res.redirect(base));
app.use(base, express.static(dir, { extensions: ['html'] }));
app.use((req, res) => res.status(404).sendFile(path.join(dir, '404.html')));
app.listen(port, () => console.log(`Демо: http://localhost:${port}${base}`));
