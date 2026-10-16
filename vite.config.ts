import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const ATTEMPTS_FILE = path.join(ROOT, 'data', 'intentos.json');

/**
 * Guarda los intentos en data/intentos.json mientras la app corre con `npm run dev` o `npm run preview`.
 * Solo escucha en el servidor local; la versión estática usa el almacenamiento del navegador.
 */
function attemptsFile(): Plugin {
  const read = (): unknown[] => {
    try {
      const parsed = JSON.parse(fs.readFileSync(ATTEMPTS_FILE, 'utf-8'));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };
  const write = (all: unknown[]) => {
    fs.mkdirSync(path.dirname(ATTEMPTS_FILE), { recursive: true });
    fs.writeFileSync(ATTEMPTS_FILE, JSON.stringify(all, null, 2), 'utf-8');
  };
  const handler = (req: any, res: any) => {
    const send = (status: number, body: unknown) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(body));
    };
    if (req.method === 'GET') return send(200, { file: path.relative(ROOT, ATTEMPTS_FILE), attempts: read() });
    if (req.method === 'POST' || req.method === 'PUT') {
      let body = '';
      req.on('data', (c: Buffer) => (body += c.toString('utf-8')));
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || 'null');
          if (req.method === 'PUT') {
            if (!Array.isArray(payload)) return send(400, { error: 'Se esperaba una lista de intentos' });
            write(payload);
          } else {
            if (!payload || typeof payload !== 'object' || !('id' in payload)) return send(400, { error: 'Intento no válido' });
            const all = read().filter((a: any) => a?.id !== (payload as any).id);
            all.push(payload);
            write(all);
          }
          send(200, { ok: true });
        } catch {
          send(400, { error: 'JSON no válido' });
        }
      });
      return;
    }
    send(405, { error: 'Método no permitido' });
  };
  return {
    name: 'attempts-file',
    configureServer(server) {
      server.middlewares.use('/api/intentos', handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/intentos', handler);
    },
  };
}

export default defineConfig({
  plugins: [react(), attemptsFile()],
  base: './',
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
} as any);
