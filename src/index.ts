import { Infrastructure } from './infrastructure'
import { DockerCompose } from './datasources/dockerCompose'
import { Config } from './config'
import style from './style/graph.json'

const css = require('@xterm/xterm/css/xterm.css')

// Lazy dark theme: the module exposes use()/unuse() (style-loader
// lazyStyleTag) so we can swap UIKit's compiled theme at runtime. The
// loader emits an ES module (use/unuse live on the default export), so
// unwrap it whether require() yields the namespace or the object directly.
const darkThemeModule = require('./style/dark.less?lazy')
const darkTheme = darkThemeModule.default || darkThemeModule
const THEME_KEY = 'theme'
let darkEnabled = false

const applyTheme = (dark: boolean) => {
	document.documentElement.classList.toggle('dark-mode', dark)
	if (dark) {
		darkTheme.use()
	} else {
		darkTheme.unuse()
	}
	const icon = document.querySelector('#theme-toggle .fa')
	if (icon) {
		icon.classList.toggle('fa-moon-o', !dark)
		icon.classList.toggle('fa-sun-o', dark)
	}
}

try {
	darkEnabled = localStorage.getItem(THEME_KEY) === 'dark'
} catch (e) { /* localStorage unavailable */ }
applyTheme(darkEnabled)

const themeToggle = document.getElementById('theme-toggle')
if (themeToggle) {
	themeToggle.onclick = (e) => {
		e.preventDefault()
		darkEnabled = !darkEnabled
		applyTheme(darkEnabled)
		try {
			localStorage.setItem(THEME_KEY, darkEnabled ? 'dark' : 'light')
		} catch (e) { /* localStorage unavailable */ }
	}
}

let graph: Infrastructure
const config = new Config()
let counter = 0
let focused = true

const updateGraph = async () => {
	console.log(counter)
	counter++
	if (!focused) {
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
	const dockerApiUrl = await config.get('docker_api_url')
	let compose = new DockerCompose(new URL(dockerApiUrl, document.URL), '', true)
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

const nameFilter = <HTMLInputElement> document.getElementById('menu-filter-name')
nameFilter.oninput = async () => {
	await graph.update(true)
}
