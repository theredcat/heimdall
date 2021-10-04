import { Infrastructure } from './infrastructure'
import { DockerCompose } from './datasources/dockerCompose'
import { Config } from './config'

const css = require('xterm/css/xterm.css')

let graph: Infrastructure
const config = new Config()
let counter = 0
let focused = true
const updateGraph = () => {
	console.log(counter)
	counter++
	if (!focused) {
		setTimeout(updateGraph, 10000)
	} else {
		graph.update().then(() => setTimeout(updateGraph, 1000))
	}
}
window.onfocus = () => {
	focused = true
}
window.onblur = () => {
	focused = false
}

window.addEventListener('DOMContentLoaded', async function() {
	const dockerApiUrl = await config.get('docker_api_url')
	let compose = new DockerCompose(new URL(dockerApiUrl), '', true)
	graph = new Infrastructure(document.getElementById('cy'))
	graph.addDataSource(compose)
	updateGraph()
})

const booleanOptions = <HTMLCollectionOf<HTMLInputElement>> document.getElementsByClassName('option-boolean')
Array.from(booleanOptions).forEach((item) => {
	item.onchange = () => {
		graph.update()
	}
})
