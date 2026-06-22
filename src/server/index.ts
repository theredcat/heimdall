// Heimdall single Node server.
//
// One process serves everything (in both APP_MODE=dev and release):
//   - GET /config.json        : dynamic, from env (replaces the old envsubst)
//   - /docker/*               : transparent passthrough proxy to the daemon
//   - /docker/...ws (upgrade) : byte tunnel to the daemon's attach/ws
//   - /terminal (upgrade)     : interactive `docker exec -it` bridge
//   - everything else         : the frontend (HMR in dev, static dist in release)

import * as http from 'http'
import * as path from 'path'
import express from 'express'
import { createDockerHttpProxy, proxyDockerUpgrade } from './proxy'
import { handleTerminalUpgrade } from './execBridge'

const PORT = parseInt(process.env.PORT || '1337', 10)
const MODE = process.env.APP_MODE === 'dev' ? 'dev' : 'release'

const app = express()

// Served dynamically so the frontend's fetch('./config.json') always gets the
// right value without a build-time envsubst step. Stays a relative path so the
// app talks to whatever origin/port serves it.
app.get('/config.json', (_req, res) => {
	res.json({ docker_api_url: process.env.DOCKER_API_URL || '/docker/' })
})

// Docker API passthrough (must come before the frontend handlers).
const dockerProxy = createDockerHttpProxy()
app.use((req, res, next) => {
	if (req.url === '/docker' || req.url.startsWith('/docker/')) return dockerProxy(req, res)
	next()
})

if (MODE === 'dev') {
	attachDevFrontend(app)
} else {
	const dist = path.resolve(process.cwd(), 'dist')
	app.use(express.static(dist))
	app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

const server = http.createServer(app)

// Single upgrade dispatcher (webpack-hot-middleware uses EventSource, not an
// upgrade, so it never reaches here).
server.on('upgrade', (req, socket, head) => {
	const url = req.url || ''
	if (url === '/terminal' || url.startsWith('/terminal?')) {
		handleTerminalUpgrade(req, socket as any, head)
	} else if (url.startsWith('/docker/')) {
		proxyDockerUpgrade(req, socket as any, head)
	} else {
		socket.destroy()
	}
})

server.listen(PORT, () => {
	console.log(`[heimdall] ${MODE} server listening on :${PORT}`)
})

// Dev: run the webpack compiler in-process (HMR) instead of webpack-dev-server,
// so a single server handles the frontend + proxy + bridges. Deps are required
// lazily so the release image (no dev deps) never needs them.
function attachDevFrontend(expressApp: express.Express) {
	/* eslint-disable @typescript-eslint/no-var-requires */
	const webpack = require('webpack')
	const devMiddleware = require('webpack-dev-middleware')
	const hotMiddleware = require('webpack-hot-middleware')
	const configFactory = require(path.resolve(process.cwd(), 'webpack.config.js'))
	const config = configFactory({}, {})
	const compiler = webpack(config)
	expressApp.use(devMiddleware(compiler, { publicPath: (config.output && config.output.publicPath) || '/' }))
	expressApp.use(hotMiddleware(compiler))
}
