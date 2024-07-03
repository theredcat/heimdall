import * as http from 'http'

import { ServerOptions, createProxyServer } from 'http-proxy'
import express from 'express'
import config from '../config.json'

const app = express()
const server = require('http').createServer(app)
const proxyServerOptions: ServerOptions = {}

if (config.docker_backend.slice(0,5) == 'unix:') {
	proxyServerOptions.target = {
		hostname: 'docker',
		socketPath: config.docker_backend.slice(5)
	}
} else {
	proxyServerOptions.target = config.docker_backend
}

const proxy = createProxyServer(proxyServerOptions)

// Proxy HTTP
app.use('/docker', (req, res) => {
	console.log(req.url)
	proxy.web(req, res, {})
});
// Proxy websockets
server.on('upgrade', function(req: http.IncomingMessage, socket: any, head: any) {
	req.url = req.url?.slice(7)
	proxy.ws(req, socket, head)
});


proxy.on('proxyRes', (proxyRes, req, res) => {
	// Dirty fix to allow dev mode. FIXME
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Headers', '*');
});

// Serve static content
app.use('/', express.static(__dirname + "/public"))

server.listen(1337)
