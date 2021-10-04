import cytoscape, {
	CytoscapeOptions, EdgeDefinition, ElementsDefinition as CyElementsDefinition,
	LayoutOptions, NodeDefinition, NodeSingular
} from 'cytoscape'
import UIkit from 'uikit'
import UIkitElement from 'uikit'
import { Host, HostModule, LogStreamType, LogLine, HostActionStatus } from './host'
import { Link, LinkModule } from './link'
import { Network, NetworkModule } from './network'
import './style/index.less'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { syntaxHighlight } from './utils'
import { Logger } from './logger'
import { Module } from './datasources/index'

const cxtmenu = require('cytoscape-cxtmenu')
const UIkitUtil: any = UIkit.util

export class Infrastructure {
	cy: cytoscape.Core
	layout: cytoscape.Layouts
	hosts: Map<string, Host> = new Map()
	networks: Map<string, Network> = new Map()
	links: Map<string, Link> = new Map()
	lastUpdateId: string = ""
	modules: Module[] = []
	logger: Logger

	static optionsTypes: { [key: string]: string } = {
		'menu-display-apps': 'boolean',
		'menu-display-networks': 'boolean'
	}

	static style = [
		{
			selector: 'node:active',
			css: {
				'overlay-opacity': '0',
			}
		},
		{
			selector: 'edge',
			css: {
				'curve-style': 'bezier',
				'target-arrow-shape': 'triangle',
			}
		},
		{
			selector: 'node[type="host"]',
			css: {
				'content': 'data(name)',
			}
		},
		{
			selector: 'node[state="running"]',
			css: {
				'background-color': 'green',
			}
		},
		{
			selector: 'node[state="stopped"]',
			css: {
				'background-color': 'red',
			}
		},
		{
			selector: 'node[state="paused"]',
			css: {
				'background-color': 'orange',
			}
		},
		{
			selector: 'node[type="network"]',
			css: {
				'content': 'data(name)',
				'shape': 'rectangle',
			}
		},
		{
			selector: 'edge[type="l2link"]',
			style: {
				'target-arrow-shape': 'none',
				'curve-style': 'bezier',
				'line-color': 'blue',
			}
		},
		{
			selector: 'edge[type="l7link"]',
			style: {
				'target-arrow-shape': 'triangle',
				'target-arrow-color': 'grey',
				'curve-style': 'bezier',
				'line-color': 'grey',
			}
		},
	]

	constructor(graphContainer: HTMLElement) {
		this.hosts = new Map<string, Host>();
		cytoscape.use(cxtmenu);
		this.cy = cytoscape(<CytoscapeOptions>{
			container: graphContainer,
			ready: function() { },
			style: Infrastructure.style,
			elements: [],
			minZoom: 0.1,
			maxZoom: 10,
		});

		(this.cy as any).cxtmenu({
			selector: 'node, edge',
			commands: this.circularMenuOptions
		})

		this.logger = new Logger(new.target.name);
	}

	// Fatarrow since that will be called by cytoscape and we need to keep 'this'
	circularMenuOptions = (node: NodeSingular) => {
		let commands: any[] = []
		commands.push({
			content: '<span class="fa fa-info"> Info</span>',
			select: (element: NodeSingular) => {
				const infoString = syntaxHighlight(JSON.stringify(
					this.hosts.get(node.id().slice(5)).getInfos(),
					null,
					4
				))

				const dialog: any = this.getWideDialog(`<div class="codeblock">${infoString}</div>`)
				dialog.show()
			}
		});
		commands.push({
			content: '<span class="fa fa-file"> Logs</span>',
			select: (element: NodeSingular) => {
				this.hosts.get(node.id().slice(5)).getLogs().then((logsData) => {
					if (logsData instanceof Terminal) {
						const term = logsData
						const dialog = this.getWideDialog('<div class="terminal"></div>')
						const fitAddon = new FitAddon()
						term.loadAddon(fitAddon)

						new ResizeObserver(() => fitAddon.fit()).observe(dialog.$el.querySelector('.terminal'))
						UIkitUtil.on(dialog.$el, 'shown', () => {
							term.open(dialog.$el.querySelector('.terminal'))
							fitAddon.fit()
						})
						UIkitUtil.on(dialog.$el, 'close', () => {
							term.dispose()
						})
						dialog.show()
					} else {
						let timestamps: string = ""
						let logs: string = ""
						const dateFormater = new Intl.DateTimeFormat(
							navigator.language,
							{
								hour: "2-digit",
								minute: "2-digit",
								second: "2-digit"
							}
						)
						for(const logLine of logsData) {
							const escapedData = logLine.data
								.replace(/\\/g,'&bsol;')
								.replace(/</g,'	&lt;')
							logs += `<span class="log-line-${logLine.stream}">${escapedData}</span>`
							timestamps += `${dateFormater.format(logLine.timestamp)}<br/>`
						}
						const dialog = this.getWideDialog(`
							<div class="logs uk-overflow-auto">
								<div class="lineprefix">${timestamps}</div>
								<div class="codeblock">${logs}</div>
							</div>
						`)
						UIkitUtil.on(dialog.$el, 'shown', () => {
							const pre = dialog.$el.getElementsByClassName('logs')[0]
							pre.scrollTop = pre.scrollHeight;
						})
						dialog.show()
					}
				})
			}
		})

		if (node.data().state == 'running') {
			commands.push({
				content: '<span class="fa fa-stop"> Stop</span>',
				select: (element: NodeSingular) => {
					node.unselect()
					const host = this.hosts.get(node.id().slice(5))
					host.stop().then((actionStatus) => {
						if(actionStatus == HostActionStatus.notSupported) {
							UIkit.modal.alert('Not implemented')
						} else if(actionStatus == HostActionStatus.fail) {
							UIkit.modal.alert('Failed')
						} else {
							UIkit.modal.alert('Host stopped')
						}
					})
				}
			})
			commands.push({
				content: '<span class="fa fa-redo"> Restart</span>',
				select: (element: NodeSingular) => {
					node.unselect()
					const host = this.hosts.get(node.id().slice(5))
					host.stop().then((actionStatus) => {
						if(actionStatus == HostActionStatus.notSupported) {
							UIkit.modal.alert('Not implemented')
						} else if(actionStatus == HostActionStatus.fail) {
							UIkit.modal.alert('Failed')
						} else {
							host.start().then((actionStatus) => {
								if(actionStatus == HostActionStatus.notSupported) {
									UIkit.modal.alert('Not implemented')
								} else if(actionStatus == HostActionStatus.fail) {
									UIkit.modal.alert('Failed')
								} else {
									UIkit.modal.alert('Host restarted')
								}
							})
						}
					})
					UIkit.modal.dialog('<div class="uk-padding"><span class="uk-text-lead">Restarting <div uk-spinner></div></span></div>')
				}
			})
			commands.push({
				content: '<span class="fa fa-terminal"> Execute</span>',
				select: (element: NodeSingular) => {
					UIkit.modal.prompt('Command to execute :', '').then((command) => {
						if(command.length > 0) {
							UIkit.modal.dialog('<div class="uk-padding"><span class="uk-text-lead">Running <div uk-spinner></div></span></div>')
							this.hosts.get(node.id().slice(5)).executeCommand(command).then((execData) => {
								if (execData instanceof Terminal) {
									const term = execData
									const dialog = this.getWideDialog('<div class="terminal"></div>')
									const fitAddon = new FitAddon()
									term.loadAddon(fitAddon)
			
									new ResizeObserver(() => fitAddon.fit()).observe(dialog.$el.querySelector('.terminal'))
									UIkitUtil.on(dialog.$el, 'shown', () => {
										term.open(dialog.$el.querySelector('.terminal'))
										fitAddon.fit()
									})
									UIkitUtil.on(dialog.$el, 'close', () => {
										term.dispose()
									})
									dialog.show()
								} else {
									UIkit.modal.alert('Not implemented')
								}
							})
						}
					})
				}
			});
		}
		if (node.data().state == 'stopped' || node.data().state == 'paused') {
			commands.push({
				content: '<span class="fa fa-play"> Start</span>',
				select: (element: NodeSingular) => {
					node.unselect()
					const host = this.hosts.get(node.id().slice(5))
					host.start().then((actionStatus) => {
						if(actionStatus == HostActionStatus.notSupported) {
							UIkit.modal.alert('Not implemented')
						} else if(actionStatus == HostActionStatus.fail) {
							UIkit.modal.alert('Failed')
						} else {
							UIkit.modal.alert('Host started')
						}
					})
				}
			})
		}
		if (node.data().state == 'stopped') {
			commands.push({
				content: '<span class="fa fa-trash"> Delete</span>',
				select: (element: NodeSingular) => {
					node.unselect()
					const host = this.hosts.get(node.id().slice(5))
					host.delete().then((actionStatus) => {
						if(actionStatus == HostActionStatus.notSupported) {
							UIkit.modal.alert('Not implemented')
						} else if(actionStatus == HostActionStatus.fail) {
							UIkit.modal.alert('Failed')
						} else {
							UIkit.modal.alert('Host deleted')
						}
					})
				}
			})
		}
		return commands
	}

	private getWideDialog(html: string): any {
		const dialog: any = UIkit.modal(
			`<div class="uk-modal">
				<div class="uk-modal-dialog wideDialog">
					${html}
				</div>
			</div>`
		)
		return dialog
	}

	public getOption(option: string, optionType: string): any {
		if (! (option in Infrastructure.optionsTypes) ) {
			throw new Error(`Option ${option} doesn't exists`)
		}
		const optionRealType = Infrastructure.optionsTypes[option]
		if (optionType != optionType) {
			throw new Error(`Option ${option} is not a boolean option but a ${optionType}`)
		}
		const element = <HTMLInputElement> document.getElementById(option)
		return element.checked
	}

	public getOptions(): { [key: string]: any} {
		const options: { [key: string]: any} = {}
		for (const option in Infrastructure.optionsTypes) {
			const optionType = Infrastructure.optionsTypes[option]
			options[option] = this.getOption(option, optionType)
		}
		return options
	}

	public addDataSource(module: Module) {
		this.modules.push(module)
	}

	public update(): Promise<boolean> {
		const modulesReturns: Promise<Host[]|Network[]|Link[]>[] = []
		for (const module of this.modules) {
			let hostsPromise: Promise<Host[]>
			if ('getHosts' in (module as any)) {
				hostsPromise = (module as HostModule).getHosts()
				this.updateHosts(hostsPromise)
			}
			if ('getNetworks' in (module as any)) {
				this.updateNetworks((module as NetworkModule).getNetworks())
			}
			if ('getLinks' in (module as any)) {
				if (hostsPromise) {
					this.updateLinks((module as LinkModule).getLinks(hostsPromise))
				}
			}
		}
		return Promise.all(modulesReturns).then(() => {
			this.updateView()
			return new Promise<boolean>((resolve,reject) => {
				resolve(true)
			})
		})
	}

	private updateView() {
		let nodesDefinitions: NodeDefinition[] = []
		let edgesDefinitions: EdgeDefinition[] = []

		const updateId = JSON.stringify([
			Array.from(this.networks.keys()),
			Array.from(this.hosts.keys()),
			Array.from(this.links.keys()),
			this.getOptions()
		])

		this.logger.debug('Last data ID :' + this.lastUpdateId + '. New data ID ' + updateId)

		if (this.lastUpdateId != updateId) {

			if (this.getOption('menu-display-networks', 'boolean')) {
				// Networks
				this.networks.forEach((network: Network, networkId: string) => {
					nodesDefinitions.push({
						data: {
							id: "network-" + network.id,
							name: network.name,
							type: "network"
						}
					})
				})
			}

			// Hosts
			this.hosts.forEach((host: Host, hostId: string) => {
				nodesDefinitions.push({
					data: {
						id: "host-" + host.id,
						name: host.name,
						state: host.state,
						type: "host"
					}
				});
				if (this.getOption('menu-display-networks', 'boolean')) {
					for (const network of Object.values(host.getNetworks())) {
						edgesDefinitions.push({
							data: {
								id: "host-" + host.id + " -> network-" + network.id,
								source: "host-" + host.id,
								target: "network-" + network.id,
								type: 'l2link'
							}
						})
					}
				}
			});

			// Links
			if (this.getOption('menu-display-apps', 'boolean')) {
				this.links.forEach((link: Link, linkId: string) => {
					edgesDefinitions.push({
						data: {
							id: 'host'+link.source.id + " -> host-" + link.target.id,
							source: 'host-'+link.source.id,
							target: 'host-'+link.target.id,
							type: 'l7link'
						}
					})
				})
			}

			let elements: CyElementsDefinition = {
				nodes: nodesDefinitions,
				edges: edgesDefinitions
			}
			this.cy.json({
				elements: elements
			})

			// Remove networks with no hosts
			this.cy.elements('node[type="network"]').forEach(node => {
				if (node.connectedEdges().length == 0) {
					node.remove()
				}
			})

			console.log("Updating layout")
			this.layout = this.cy.layout(<LayoutOptions>{
				name: 'cose',
				animation: true,
				nodeDimensionsIncludeLabels: true,
				componentSpacing: 50,
			})
			this.layout.run()
			this.lastUpdateId = updateId
		}
	}

	private updateHosts(hostsPromise: Promise<Host[]>) {
		return hostsPromise.then((hosts) => {
			for (let host of hosts) {
				this.hosts.set(host.id, host)
			}
		})
	}
	private updateNetworks(networksPromise: Promise<Network[]>) {
		return networksPromise.then((networks) => {
			for (let network of networks) {
				this.networks.set(network.id, network)
			}
		})
	}
	private updateLinks(linksPromise: Promise<Link[]>) {
		return linksPromise.then((links) => {
			for (let link of links) {
				this.links.set(link.source.id + ':' + link.target.id, link)
			}
		})
	}
}
