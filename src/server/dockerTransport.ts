// Unified Docker daemon transport.
//
// Parses DOCKER_HOST exactly like the docker CLI and exposes a single
// dialDocker() primitive that returns a fresh raw Duplex stream to the daemon
// for every transport (unix / tcp / tcp+TLS / ssh). Everything else in the
// server (the HTTP passthrough proxy, the attach-ws tunnel and the exec
// bridge) is built on top of that one primitive.

import * as net from 'net'
import * as tls from 'tls'
import * as http from 'http'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as crypto from 'crypto'
import { Duplex } from 'stream'
import { Client as SshClient } from 'ssh2'

export type DockerEndpoint =
	| { kind: 'unix'; socketPath: string }
	| { kind: 'tcp'; host: string; port: number }
	| { kind: 'tls'; host: string; port: number; ca?: Buffer; cert?: Buffer; key?: Buffer; rejectUnauthorized: boolean }
	| { kind: 'ssh'; host: string; port: number; user: string }

const DEFAULT_UNIX = '/var/run/docker.sock'

function isTruthy(v?: string): boolean {
	return v != null && v !== '' && v !== '0' && v.toLowerCase() !== 'false'
}

let cachedEndpoint: DockerEndpoint | null = null

export function parseDockerHost(): DockerEndpoint {
	if (!cachedEndpoint) cachedEndpoint = computeEndpoint()
	return cachedEndpoint
}

function computeEndpoint(): DockerEndpoint {
	const raw = (process.env.DOCKER_HOST || '').trim()
	if (!raw) return { kind: 'unix', socketPath: DEFAULT_UNIX }
	if (raw.startsWith('/')) return { kind: 'unix', socketPath: raw }

	const m = /^([a-z0-9+.-]+):\/\/(.*)$/i.exec(raw)
	if (!m) throw new Error(`Invalid DOCKER_HOST: ${raw}`)
	const scheme = m[1].toLowerCase()
	const rest = m[2]

	switch (scheme) {
		case 'unix':
			return { kind: 'unix', socketPath: rest || DEFAULT_UNIX }
		case 'npipe':
			throw new Error('DOCKER_HOST npipe:// (Windows named pipe) cannot be reached from this Linux container')
		case 'fd':
			throw new Error('DOCKER_HOST fd:// (systemd socket activation) is a daemon-side transport and has no client dial semantics')
		case 'ssh': {
			let userHost = rest
			let user = process.env.USER || 'root'
			const at = userHost.indexOf('@')
			if (at >= 0) { user = userHost.slice(0, at); userHost = userHost.slice(at + 1) }
			let host = userHost
			let port = 22
			const colon = userHost.lastIndexOf(':')
			if (colon >= 0) { host = userHost.slice(0, colon); port = parseInt(userHost.slice(colon + 1), 10) || 22 }
			return { kind: 'ssh', host, port, user }
		}
		case 'tcp':
		case 'http':
		case 'https': {
			let host = rest
			let port = 0
			const colon = rest.lastIndexOf(':')
			if (colon >= 0) { host = rest.slice(0, colon); port = parseInt(rest.slice(colon + 1), 10) }
			if (!host) host = 'localhost'
			const tlsVerify = isTruthy(process.env.DOCKER_TLS_VERIFY)
			const certPath = process.env.DOCKER_CERT_PATH
			const useTls = scheme === 'https' || tlsVerify || !!certPath
			if (!port) port = useTls ? 2376 : 2375
			if (useTls) {
				const dir = certPath || path.join(os.homedir(), '.docker')
				const read = (f: string): Buffer | undefined => {
					try { return fs.readFileSync(path.join(dir, f)) } catch { return undefined }
				}
				return { kind: 'tls', host, port, ca: read('ca.pem'), cert: read('cert.pem'), key: read('key.pem'), rejectUnauthorized: tlsVerify }
			}
			return { kind: 'tcp', host, port }
		}
		default:
			throw new Error(`Unsupported DOCKER_HOST scheme: ${scheme}://`)
	}
}

// --- dialDocker: one fresh Duplex per call -------------------------------

export function dialDocker(): Promise<Duplex> {
	const ep = parseDockerHost()
	switch (ep.kind) {
		case 'unix': return connectNet({ path: ep.socketPath })
		case 'tcp': return connectNet({ host: ep.host, port: ep.port })
		case 'tls': return connectTls(ep)
		case 'ssh': return dialSsh(ep)
	}
}

function connectNet(opts: net.NetConnectOpts): Promise<Duplex> {
	return new Promise((resolve, reject) => {
		const sock = net.connect(opts)
		sock.once('connect', () => resolve(sock))
		sock.once('error', reject)
	})
}

function connectTls(ep: Extract<DockerEndpoint, { kind: 'tls' }>): Promise<Duplex> {
	return new Promise((resolve, reject) => {
		const sock = tls.connect({
			host: ep.host, port: ep.port,
			ca: ep.ca, cert: ep.cert, key: ep.key,
			servername: ep.host, rejectUnauthorized: ep.rejectUnauthorized,
		})
		sock.once('secureConnect', () => resolve(sock))
		sock.once('error', reject)
	})
}

// --- SSH transport (mirrors `docker -H ssh://...` = `docker system dial-stdio` over ssh) ---

let sshReady: Promise<SshClient> | null = null

function getSshClient(ep: Extract<DockerEndpoint, { kind: 'ssh' }>): Promise<SshClient> {
	if (sshReady) return sshReady
	sshReady = new Promise((resolve, reject) => {
		const conn = new SshClient()
		conn.on('ready', () => resolve(conn))
		conn.on('error', (err) => { sshReady = null; reject(err) })
		conn.on('close', () => { sshReady = null })
		conn.connect({
			host: ep.host,
			port: ep.port,
			username: ep.user,
			agent: process.env.SSH_AUTH_SOCK || undefined,
			privateKey: loadFirstPrivateKey(),
			hostVerifier: makeHostVerifier(ep),
		})
	})
	return sshReady
}

function dialSsh(ep: Extract<DockerEndpoint, { kind: 'ssh' }>): Promise<Duplex> {
	return getSshClient(ep).then((conn) => new Promise<Duplex>((resolve, reject) => {
		conn.exec('docker system dial-stdio', (err, stream) => {
			if (err) return reject(err)
			resolve(stream as unknown as Duplex)
		})
	}))
}

function loadFirstPrivateKey(): Buffer | undefined {
	const dir = path.join(os.homedir(), '.ssh')
	for (const name of ['id_ed25519', 'id_ecdsa', 'id_rsa']) {
		try { return fs.readFileSync(path.join(dir, name)) } catch { /* try next */ }
	}
	return undefined
}

// known_hosts verification: supports plain and hashed (|1|salt|hash) entries.
function makeHostVerifier(ep: Extract<DockerEndpoint, { kind: 'ssh' }>): (key: Buffer) => boolean {
	return (key: Buffer): boolean => {
		if (isTruthy(process.env.DOCKER_SSH_INSECURE)) return true
		const b64 = key.toString('base64')
		for (const entry of loadKnownHosts()) {
			if (entry.key === b64 && hostMatches(entry.hostField, ep.host, ep.port)) return true
		}
		return false
	}
}

function loadKnownHosts(): Array<{ hostField: string; key: string }> {
	const files = process.env.DOCKER_SSH_KNOWN_HOSTS
		? [process.env.DOCKER_SSH_KNOWN_HOSTS]
		: [path.join(os.homedir(), '.ssh', 'known_hosts'), '/etc/ssh/ssh_known_hosts']
	const out: Array<{ hostField: string; key: string }> = []
	for (const file of files) {
		let content: string
		try { content = fs.readFileSync(file, 'utf8') } catch { continue }
		for (const line of content.split('\n')) {
			const trimmed = line.trim()
			if (!trimmed || trimmed.startsWith('#')) continue
			const parts = trimmed.split(/\s+/)
			if (parts.length < 3) continue
			out.push({ hostField: parts[0], key: parts[2] })
		}
	}
	return out
}

function hostMatches(field: string, host: string, port: number): boolean {
	const names = port === 22 ? [host] : [`[${host}]:${port}`]
	if (field.startsWith('|1|')) {
		const parts = field.split('|') // ['', '1', salt, hash]
		if (parts.length < 4) return false
		const salt = Buffer.from(parts[2], 'base64')
		return names.some((n) => crypto.createHmac('sha1', salt).update(n).digest('base64') === parts[3])
	}
	const list = field.split(',')
	return names.some((n) => list.includes(n))
}

// --- HTTP plumbing on top of dialDocker ----------------------------------

// An http.Agent whose connections are dialed through dialDocker(), so the
// passthrough proxy reaches the daemon over any transport transparently.
export function makeDockerAgent(): http.Agent {
	const agent = new http.Agent({ keepAlive: false })
	;(agent as any).createConnection = (_opts: unknown, cb: (err: Error | null, sock?: Duplex) => void) => {
		dialDocker().then((sock) => cb(null, sock)).catch((err) => cb(err))
	}
	return agent
}

export interface HttpResponseHead {
	statusCode: number
	headers: Record<string, string>
	leftover: Buffer
}

// Consume the HTTP response head (status line + headers) off a hijacked
// duplex, returning any payload bytes that arrived in the same chunk. The
// stream is left PAUSED so the caller can wire its sink without dropping
// bytes — calling .pipe() on it resumes flow automatically.
export function readHttpResponseHead(duplex: Duplex): Promise<HttpResponseHead> {
	return new Promise((resolve, reject) => {
		let buf = Buffer.alloc(0)
		const onData = (chunk: Buffer) => {
			buf = Buffer.concat([buf, chunk])
			const idx = buf.indexOf('\r\n\r\n')
			if (idx === -1) return
			duplex.removeListener('data', onData)
			duplex.removeListener('error', onErr)
			duplex.pause()
			const head = buf.slice(0, idx).toString('utf8')
			const leftover = buf.slice(idx + 4)
			const lines = head.split('\r\n')
			const statusLine = lines.shift() || ''
			const statusCode = parseInt(statusLine.split(' ')[1], 10)
			const headers: Record<string, string> = {}
			for (const line of lines) {
				const c = line.indexOf(':')
				if (c > 0) headers[line.slice(0, c).trim().toLowerCase()] = line.slice(c + 1).trim()
			}
			resolve({ statusCode, headers, leftover })
		}
		const onErr = (e: Error) => { duplex.removeListener('data', onData); reject(e) }
		duplex.on('data', onData)
		duplex.once('error', onErr)
	})
}

// Issue a simple HTTP request to the daemon over a dedicated duplex and read
// the (small, buffered) JSON/text body. Used for exec create + resize, where
// we are NOT hijacking. Returns { statusCode, body }.
export function dockerRequest(
	method: string,
	pathName: string,
	body?: string,
): Promise<{ statusCode: number; body: string }> {
	return dialDocker().then((duplex) => new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
		const payload = body != null ? Buffer.from(body) : Buffer.alloc(0)
		const reqHead =
			`${method} ${pathName} HTTP/1.1\r\n` +
			`Host: docker\r\n` +
			`Accept: application/json\r\n` +
			(body != null ? `Content-Type: application/json\r\nContent-Length: ${payload.length}\r\n` : '') +
			`Connection: close\r\n\r\n`
		duplex.write(reqHead)
		if (payload.length) duplex.write(payload)

		readHttpResponseHead(duplex).then(({ statusCode, headers, leftover }) => {
			const chunks: Buffer[] = leftover.length ? [leftover] : []
			duplex.on('data', (c: Buffer) => chunks.push(c))
			duplex.on('end', () => resolve({ statusCode, body: decodeBody(Buffer.concat(chunks), headers) }))
			duplex.on('error', reject)
			duplex.resume()
		}).catch(reject)
	}))
}

// Minimal chunked-transfer decoder (daemon may reply chunked on "Connection: close").
function decodeBody(raw: Buffer, headers: Record<string, string>): string {
	if ((headers['transfer-encoding'] || '').toLowerCase() !== 'chunked') return raw.toString('utf8')
	let out = ''
	let i = 0
	while (i < raw.length) {
		const nl = raw.indexOf('\r\n', i)
		if (nl === -1) break
		const size = parseInt(raw.slice(i, nl).toString('utf8').trim(), 16)
		if (!size || isNaN(size)) break
		out += raw.slice(nl + 2, nl + 2 + size).toString('utf8')
		i = nl + 2 + size + 2
	}
	return out
}
