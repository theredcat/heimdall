// Transparent passthrough proxy for the Docker API, mounted at /docker.
//
// - HTTP requests go through `http-proxy` with a custom agent that dials the
//   daemon over any transport (see dockerTransport).
// - WebSocket upgrades (the daemon's /containers/{id}/attach/ws used by the
//   logs/attach views) are tunnelled verbatim on top of dialDocker(): we
//   forward the browser's upgrade request — including its Sec-WebSocket-Key —
//   to the daemon, relay the daemon's 101 handshake back, then pipe bytes
//   both ways. The daemon speaks the WS protocol for that route, so this is a
//   pure byte tunnel (no frame parsing), exactly like the old nginx config.

import httpProxy from 'http-proxy'
import { IncomingMessage, ServerResponse } from 'http'
import { Duplex } from 'stream'
import { dialDocker, makeDockerAgent } from './dockerTransport'

export const DOCKER_PREFIX = '/docker'

function stripPrefix(url: string): string {
	if (url === DOCKER_PREFIX) return '/'
	if (url.startsWith(DOCKER_PREFIX + '/')) return url.slice(DOCKER_PREFIX.length)
	return url
}

// Express-style middleware for /docker/* HTTP requests.
export function createDockerHttpProxy() {
	const proxy = httpProxy.createProxyServer({ agent: makeDockerAgent(), ignorePath: false })
	proxy.on('error', (err: Error, _req: IncomingMessage, res: ServerResponse | Duplex) => {
		const r = res as ServerResponse
		if (r && typeof r.writeHead === 'function' && !r.headersSent) {
			r.writeHead(502, { 'content-type': 'application/json' })
			r.end(JSON.stringify({ message: `docker daemon unreachable: ${err.message}` }))
		} else if (res) {
			try { (res as Duplex).destroy() } catch { /* already gone */ }
		}
	})

	return (req: IncomingMessage, res: ServerResponse) => {
		req.url = stripPrefix(req.url || '/')
		// target host is nominal: the agent's createConnection dials the daemon.
		proxy.web(req, res, { target: 'http://docker' })
	}
}

// Tunnel a /docker/...ws upgrade to the daemon's matching WS endpoint.
export function proxyDockerUpgrade(req: IncomingMessage, clientSocket: Duplex, head: Buffer) {
	dialDocker().then((daemon) => {
		const targetPath = stripPrefix(req.url || '/')
		let raw = `${req.method} ${targetPath} HTTP/1.1\r\n`
		for (const [k, v] of Object.entries(req.headers)) {
			if (k.toLowerCase() === 'host') continue
			if (Array.isArray(v)) for (const vv of v) raw += `${k}: ${vv}\r\n`
			else if (v != null) raw += `${k}: ${v}\r\n`
		}
		raw += 'Host: docker\r\n\r\n'
		daemon.write(raw)
		if (head && head.length) daemon.write(head)

		// Verbatim byte tunnel (includes the daemon's 101 handshake response).
		daemon.pipe(clientSocket)
		clientSocket.pipe(daemon)
		const kill = () => { daemon.destroy(); clientSocket.destroy() }
		daemon.on('error', kill)
		clientSocket.on('error', kill)
		daemon.on('close', () => clientSocket.destroy())
		clientSocket.on('close', () => daemon.destroy())
	}).catch(() => {
		try { clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n') } catch { /* socket gone */ }
		try { clientSocket.destroy() } catch { /* already gone */ }
	})
}
