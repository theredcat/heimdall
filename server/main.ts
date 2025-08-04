import connect from 'connect'
import serveStatic from 'serve-static'
import path from 'node:path'
import fs from 'fs/promises'
import { createServer as createViteServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, pathToFileURL } from 'node:url'
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
const httpServer = http.createServer(app)
const wss = new WebSocketServer({ server: httpServer })

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

  app.use(async (req, res) => {
    res.setHeader('Content-Type', 'text/html')
    const html = await fs.readFile(path.resolve(__dirname, '../client/index.html'), 'utf-8')
    res.end(html)
  })
} else {
  app.use(serveStatic(path.resolve(__dirname, '../dist')))

  app.use(async (req, res) => {
    res.setHeader('Content-Type', 'text/html')
    const html = await fs.readFile(path.resolve(__dirname, '../client/index.html'), 'utf-8')
    res.end(html)
  })
}

const DATASOURCE_DIR = path.resolve(__dirname, '../src/datasources')

const loadDatasources = async (): Promise<string[]> => {
  const entries = await fs.readdir(DATASOURCE_DIR, { withFileTypes: true })
  const clients: string[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const clientFilePath = path.join(DATASOURCE_DIR, entry.name, 'client.ts')
    try {
      await fs.access(clientFilePath)
      clients.push(entry.name)
    } catch {
      logger.error(`Directory module ${entry.name} doesn't have a client.ts. Datasources must have a client.ts`)
    }
  }

  return clients
}

wss.on('connection', async (ws) => {
  const datasources = await loadDatasources()
  ws.send(JSON.stringify({
    type: 'datasource-list',
    data: datasources
  }))
})

httpServer.listen(port, () => {
  logger.info(`🚀 Server started on http://localhost:${port}`)
})
