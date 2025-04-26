import connect from 'connect'
import serveStatic from 'serve-static'
import path from 'node:path'
import fs from 'node:fs'
import { createServer as createViteServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
import http from 'node:http'
import { WebSocketServer } from 'ws'

import packageJson from '../package.json'
import { Logger } from '../src/logger.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const logger = new Logger(packageJson.name)

const isProd = process.env.NODE_ENV === 'production'
const port = 1337

const app = connect()
const wss = new WebSocketServer({ server: http.createServer(app) })

// Middleware de log
app.use((req, res, next) => {
  logger.info(`Request: ${req.url}`)
  next()
})

if (!isProd) {
  logger.warn('Starting in dev mode')

  const vite = await createViteServer({
    root: path.resolve(__dirname, '../client'),
    server: { middlewareMode: true },
    appType: 'custom',
    plugins: [ vue() ],
    resolve: {
      alias: {
        '@src': path.resolve(__dirname, '../src')
      }
    },
  })

  app.use(vite.middlewares)

  app.use((req, res) => {
    res.setHeader('Content-Type', 'text/html')
    fs.createReadStream(path.resolve(__dirname, '../client/index.html')).pipe(res)
  })
} else {
  app.use(serveStatic(path.resolve(__dirname, '../dist')))

  app.use((req, res) => {
    res.setHeader('Content-Type', 'text/html')
    fs.createReadStream(path.resolve(__dirname, '../dist/index.html')).pipe(res)
  })
}

wss.on('connection', (ws) => {
  logger.info(`${JSON.stringify(ws)} connected`);

  ws.on('message', (message) => {
    logger.info(`Reçu : ${JSON.stringify(message.toString())}`);

    ws.send(`Echo: ${message}`);
  });

  ws.send('Bienvenue via WebSocket !');
});

http.createServer(app).listen(port, () => {
  logger.info(`🚀 Server started on http://localhost:${port}`)
})
