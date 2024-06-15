import cytoscape, {
    CytoscapeOptions, EdgeDefinition, ElementsDefinition as CyElementsDefinition,
    LayoutOptions, NodeDefinition, NodeSingular
} from 'cytoscape'
import UIkit from 'uikit'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { Module } from './datasources/index'
import { Host, HostActionStatus, HostModule } from './host'
import { Link, LinkModule } from './link'
import { Logger } from './logger'
import { Network, NetworkModule } from './network'
import './style/index.less'
import { syntaxHighlight } from './utils'
const coseBilkent = require('cytoscape-cose-bilkent')

const cxtmenu = require('cytoscape-cxtmenu')
const UIkitUtil: any = UIkit.util

export class Infrastructure {
	cy: cytoscape.Core
	layout: cytoscape.Layouts
	hosts: Map<string, Host> = new Map()
	networks: Map<string, Network> = new Map()
	links: Map<string, Link> = new Map()
	modules: Module[] = []
	logger: Logger

	static optionsTypes: { [key: string]: string } = {
		'menu-display-apps': 'boolean',
		'menu-display-networks': 'boolean'
	}


	constructor(graphContainer: HTMLElement, style: any) {
		this.hosts = new Map<string, Host>();
		cytoscape.use( cxtmenu )
		cytoscape.use( coseBilkent )
		this.cy = cytoscape(<CytoscapeOptions>{
			container: graphContainer,
			ready: function() { },
			style: style,
			elements: [],
			minZoom: 0.1,
			maxZoom: 10,
		});

		(this.cy as any).cxtmenu({
			selector: 'node, edge',
			commands: this.circularMenuOptions,
			outsideMenuCancel: 10
		})

		this.logger = new Logger(new.target.name);
	}

	// Fatarrow since that will be called by cytoscape and we need to keep 'this'
	circularMenuOptions = (node: NodeSingular) => {
		if (node.isEdge())
			return []

		const commands: any[] = []
		commands.push({
			content: '<span class="fa fa-info"> Info</span>',
			select: (element: NodeSingular) => {
				const infoString = syntaxHighlight(JSON.stringify(
					this.hosts.get(node.id().slice(5)).getInfos(),
					null,
					4
				))

				const dialog = this.getWideDialog(`<div class="codeblock">${infoString}</div>`)
				dialog.dialog.show()
			}
		});
		commands.push({
			content: '<span class="fa fa-file"> Logs</span>',
			select: (element: NodeSingular) => {
				this.hosts.get(node.id().slice(5)).getLogs().then(async (logsData) => {
					if (logsData instanceof Terminal) {
						const dialog = this.showTerminalInDialog(logsData)
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
						UIkitUtil.on(dialog, 'shown', () => {
							dialog.content.scrollTop = dialog.content.scrollHeight;
						})
						dialog.dialog.show()
					}
				})
			}
		})

		if (node.data().state == 'running' || node.data().state == 'unhealthy') {
			commands.push({
				content: '<span class="fa fa-stop"> Stop</span>',
				select: (element: NodeSingular) => {
					node.unselect()
					const host = this.hosts.get(node.id().slice(5))
					UIkit.notification("Stopping ...", {pos: 'top-right'})
					host.stop().then((actionStatus) => {
						if(actionStatus == HostActionStatus.notSupported) {
							UIkit.modal.alert('This host provider doensn\'t support the stop action')
						} else if(actionStatus == HostActionStatus.fail) {
							UIkit.modal.alert('Failed to stop host')
						} else {
							UIkit.notification("Host stopped", {pos: 'top-right'})
						}
					})
				}
			})
			commands.push({
				content: '<span class="fa fa-redo"> Restart</span>',
				select: (element: NodeSingular) => {
					node.unselect()
					const host = this.hosts.get(node.id().slice(5))
					const notification = UIkit.notification('Restarting <div uk-spinner></div>', {pos: 'top-right', timeout: 0})
					host.stop().then((actionStatus) => {
						if(actionStatus == HostActionStatus.notSupported) {
							UIkit.modal.alert('This host provider doensn\'t support the restart action')
						} else if(actionStatus == HostActionStatus.fail) {
							UIkit.modal.alert('Failed')
						} else {
							host.start().then((actionStatus) => {
								notification.close(true)
								if(actionStatus == HostActionStatus.notSupported) {
									UIkit.modal.alert('This host provider doensn\'t support the start action')
								} else if(actionStatus == HostActionStatus.fail) {
									UIkit.modal.alert('Host restart failed')
								} else {
									UIkit.notification(`${element.data('name')} restarted`, {pos: 'top-right'})
								}
							})
						}
					})
				}
			})
			commands.push({
				content: '<span class="fa fa-terminal"> Execute</span>',
				select: (element: NodeSingular) => {
					UIkit.modal.prompt('Command to execute :', '/bin/bash').then((command) => {
						if(command.length > 0) {
							UIkit.modal.dialog('<div class="uk-padding"><span class="uk-text-lead">Running <div uk-spinner></div></span></div>')
							this.hosts.get(node.id().slice(5)).executeCommand(command).then((execData) => {
								if (execData instanceof Terminal) {
									this.showTerminalInDialog(execData)
								} else {
									UIkit.modal.alert('This host provider doensn\'t support the execute action')
								}
							})
						}
					})
				}
			});
		}
		if (node.data().state == 'stopped' || node.data().state == 'suspended') {
			commands.push({
				content: '<span class="fa fa-play"> Start</span>',
				select: (element: NodeSingular) => {
					node.unselect()
					const host = this.hosts.get(node.id().slice(5))
					host.start().then((actionStatus) => {
						if(actionStatus == HostActionStatus.notSupported) {
							UIkit.modal.alert('This host provider doensn\'t support the start action')
						} else if(actionStatus == HostActionStatus.fail) {
							UIkit.modal.alert('Failed')
						} else {
							UIkit.notification('Host started', {pos: 'top-right'})
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

	private getWideDialog(htmlString: string): { dialog: UIkit.UIkitModalElement; content: HTMLElement } {
		const element = UIkitUtil.$(
			`<div class="uk-modal">
				<div class="uk-modal-dialog wideDialog">
					${htmlString}
				</div>
			</div>`
		)
		const dialog: any = UIkit.modal(element)
		const content: HTMLElement = dialog.$el
		return {dialog, content }
	}

	private async showTerminalInDialog(term: Terminal) {
		const dialog = this.getWideDialog('<div class="terminal"></div>')
		const fitAddon = new FitAddon()
		term.loadAddon(fitAddon)
		new ResizeObserver(() => fitAddon.fit()).observe(dialog.content)
		UIkitUtil.on(dialog.content, 'shown', () => {
			const terminalDiv = dialog.content.getElementsByClassName('terminal')[0] as HTMLElement
			term.open(terminalDiv)
			fitAddon.fit()
		})
		dialog.dialog.show()
		UIkitUtil.on(dialog.content, 'closed', () => {
			term.dispose()
		})
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

	public update(autoArrangeNodes = false): Promise<boolean> {
		this.logger.debug('Infrastructure: Updating graph')
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
			this.updateView(autoArrangeNodes)
			return new Promise<boolean>((resolve,reject) => {
				resolve(true)
			})
		})
	}

	private updateView(autoArrangeNodes: Boolean) {
		const nodesDefinitions: NodeDefinition[] = []
		const edgesDefinitions: EdgeDefinition[] = []

		if (this.getOption('menu-display-networks', 'boolean')) {
			// Networks
			for (const network of this.networks.values()) {
				nodesDefinitions.push({
					data: {
						id: "network-" + network.id,
						name: network.name,
						type: "network"
					}
				})
			}
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
			for (const link of this.links.values()) {
				edgesDefinitions.push({
					data: {
						id: 'host'+link.source.id + " -> host-" + link.target.id,
						source: 'host-'+link.source.id,
						target: 'host-'+link.target.id,
						type: 'l7link'
					}
				})
			}
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

		if (autoArrangeNodes) {
			this.logger.info("Updating layout")
			this.layout = this.cy.layout(<LayoutOptions>{
				name: 'cose-bilkent',
				animation: false,
				nodeDimensionsIncludeLabels: true,
				fit: true,
				tile: true,
				gravityRange: 20.0
			});
			this.layout.run()
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
