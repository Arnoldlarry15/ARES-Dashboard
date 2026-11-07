import path from 'path';
import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import dotenv from 'dotenv';

dotenv.config();

function devApiPlugin(): Plugin {
  return {
    name: 'ares-dev-api-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url && req.url.startsWith('/api/generate-tactic') && req.method === 'POST') {
          try {
            let body = '';
            for await (const chunk of req) {
              body += chunk;
            }
            const parsedBody = body ? JSON.parse(body) : {};
            const { handleRequest } = await import('./api/generate-tactic');

            const mockReq: any = {
              method: 'POST',
              headers: req.headers,
              body: parsedBody,
              query: {},
            };

            const mockRes: any = {
              statusCode: 200,
              setHeader(name: string, value: string) {
                res.setHeader(name, value);
                return this;
              },
              status(code: number) {
                this.statusCode = code;
                res.statusCode = code;
                return this;
              },
              json(data: any) {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(data));
                return this;
              }
            };

            await handleRequest(mockReq, mockRes);
          } catch (err: any) {
            console.error('Dev API middleware error:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message || 'Internal Server Error' }));
          }
        } else {
          next();
        }
      });
    }
  };
}

export default defineConfig({
  base: '/',
  server: {
    port: 5173,
    host: '0.0.0.0',
  },
  plugins: [react(), devApiPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild',
  },
  preview: {
    port: 5173,
    host: '0.0.0.0',
  }
});
