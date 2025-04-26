import { Infrastructure } from './infrastructure'
import { DockerCompose } from './datasources/dockerCompose'
import { Config } from './config'
import style from './style/graph.json'

const css = require('@xterm/xterm/css/xterm.css')

let graph: Infrastructure
const config = new Config()
let counter = 0
let focused = true

const updateGraph = async () => {
	console.log(counter)
	counter++
	if (!focused || !graph.getOption('menu-autorefresh', 'boolean')) {
		setTimeout(updateGraph, 1000)
	} else {
		await graph.update()
		setTimeout(updateGraph, 1000)
	}
}
window.onfocus = () => {
	focused = true
}
window.onblur = () => {
	focused = false
}

window.addEventListener('DOMContentLoaded', async function() {
	let compose = new DockerCompose(config, '', true)
	graph = new Infrastructure(document.getElementById('cy'), style)
	graph.addDataSource(compose)
	await graph.update(true)
	updateGraph()
})

const booleanOptions = <HTMLCollectionOf<HTMLInputElement>> document.getElementsByClassName('option-boolean')
Array.from(booleanOptions).forEach(item => {
	item.onchange = async () => {
		await graph.update(true)
	}
})
document.getElementById('action-rearrange-nodes').onclick = () => {
	graph.update(true)
}
