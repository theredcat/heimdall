// Interactive `docker exec -it` bridge, mounted at /terminal.
//
// Docker's /exec/{id}/start is an HTTP connection HIJACK (raw bidirectional
// stream) with NO WebSocket variant, so we translate: the browser opens a
// WebSocket here; we create the exec, start it hijacked, and pipe bytes.
//
// Framing:
//   server -> browser : raw PTY bytes (binary frames)
//   browser -> server : binary frame  = stdin (written to the daemon)
//                       text frame     = JSON control, e.g. {"type":"resize",cols,rows}
// With Tty:true the daemon stream is RAW (no 8-byte multiplexing headers), so
// it must be tunnelled transparently — never demuxed.

import { WebSocketServer, WebSocket } from 'ws'
import { IncomingMessage } from 'http'
import { Duplex } from 'stream'
import { URL } from 'url'
import { split as shlex } from 'shlex'
import { dialDocker, readHttpResponseHead, dockerRequest } from './dockerTransport'

const wss = new WebSocketServer({ noServer: true })

const HIGH_WATER = 1 << 20 // 1 MiB
const LOW_WATER = 1 << 18  // 256 KiB

export function handleTerminalUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
	wss.handleUpgrade(req, socket as any, head, (ws) => {
		startExecSession(ws, req).catch((err) => {
			const msg = String((err && err.message) || err)
			try { ws.send(`\r\n\x1b[31mfailed to open shell: ${msg}\x1b[0m\r\n`) } catch { /* ws gone */ }
			try { ws.close() } catch { /* already closed */ }
		})
	})
}

async function startExecSession(ws: WebSocket, req: IncomingMessage) {
	const url = new URL(req.url || '', 'http://localhost')
	const id = url.searchParams.get('id')
	const cmd = url.searchParams.get('cmd') || '/bin/sh'
	if (!id) throw new Error('missing container id')

	// 1. Create the exec instance (interactive PTY).
	const created = await dockerRequest('POST', `/containers/${id}/exec`, JSON.stringify({
		AttachStdin: true, AttachStdout: true, AttachStderr: true, Tty: true, Cmd: shlex(cmd),
	}))
	if (created.statusCode >= 400) throw new Error(`exec create (${created.statusCode}): ${created.body}`)
	const execId = JSON.parse(created.body).Id
	if (!execId) throw new Error('daemon returned no exec id')

	// 2. Start it on a dedicated hijacked connection.
	const daemon = await dialDocker()
	const startBody = Buffer.from(JSON.stringify({ Detach: false, Tty: true }))
	daemon.write(
		`POST /exec/${execId}/start HTTP/1.1\r\n` +
		`Host: docker\r\n` +
		`Content-Type: application/json\r\n` +
		`Content-Length: ${startBody.length}\r\n` +
		`Connection: Upgrade\r\nUpgrade: tcp\r\n\r\n`,
	)
	daemon.write(startBody)
	const res = await readHttpResponseHead(daemon)
	if (res.statusCode >= 400) throw new Error(`exec start (${res.statusCode})`)

	// 3. Pipe daemon <-> websocket.
	if (res.leftover.length) ws.send(res.leftover)
	daemon.on('data', (chunk: Buffer) => {
		if (ws.readyState !== WebSocket.OPEN) return
		ws.send(chunk)
		if (ws.bufferedAmount > HIGH_WATER) {
			daemon.pause()
			const timer = setInterval(() => {
				if (ws.readyState !== WebSocket.OPEN || ws.bufferedAmount < LOW_WATER) {
					clearInterval(timer)
					daemon.resume()
				}
			}, 20)
		}
	})
	daemon.resume()

	ws.on('message', (data: Buffer, isBinary: boolean) => {
		if (isBinary) { daemon.write(data); return }
		try {
			const msg = JSON.parse(data.toString('utf8'))
			if (msg && msg.type === 'resize') {
				dockerRequest('POST', `/exec/${execId}/resize?h=${msg.rows | 0}&w=${msg.cols | 0}`).catch(() => {})
			}
		} catch { /* ignore malformed control frame */ }
	})

	// Docker has no "kill exec" API and closing the hijacked connection does
	// NOT terminate the exec'd process, so when the browser disconnects we nudge
	// the session to exit through the PTY: Ctrl-C aborts any foreground program /
	// partial input (back to an empty prompt), Ctrl-D then EOFs the shell. Only
	// then do we tear the connection down.
	let closed = false
	const teardown = (nudge: boolean) => {
		if (closed) return
		closed = true
		if (nudge && daemon.writable) {
			try { daemon.write(Buffer.from([0x03])) } catch { /* gone */ } // Ctrl-C
			try { daemon.write(Buffer.from([0x04])) } catch { /* gone */ } // Ctrl-D (EOF)
			setTimeout(() => { try { daemon.destroy() } catch { /* gone */ } }, 200)
		} else {
			try { daemon.destroy() } catch { /* gone */ }
		}
		if (ws.readyState === WebSocket.OPEN) { try { ws.close() } catch { /* closing */ } }
	}
	daemon.on('end', () => teardown(false))
	daemon.on('close', () => teardown(false))
	daemon.on('error', () => teardown(false))
	ws.on('close', () => teardown(true))
}
