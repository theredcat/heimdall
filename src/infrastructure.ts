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
import { t } from './i18n'
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
	// Live interactive exec sessions, kept alive across dialog open/close so the
	// same terminal can be reattached instead of spawning a new one. Keyed by host id.
	terminalSessions: Map<string, { term: Terminal; socket: WebSocket; fitAddon?: FitAddon; opened: boolean }> = new Map()

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
			wheelSensitivity: 0.2,
		});

		(this.cy as any).cxtmenu({
			selector: 'node, edge',
			commands: this.circularMenuOptions,
			outsideMenuCancel: 10
		})

		// Highlight the selected node and its direct neighbours, dim the rest
		this.cy.on('select', 'node', (event) => {
			const neighbourhood = event.target.closedNeighborhood()
			this.cy.elements().not(neighbourhood).addClass('dimmed')
			neighbourhood.removeClass('dimmed').addClass('highlighted')
		})
		this.cy.on('unselect', 'node', () => {
			this.cy.elements().removeClass('dimmed highlighted')
		})

		this.logger = new Logger(new.target.name);
	}

	// Fatarrow since that will be called by cytoscape and we need to keep 'this'
	circularMenuOptions = (node: NodeSingular) => {
		if (node.isEdge())
			return this.edgeMenuOptions(node)

		const commands: any[] = []
		commands.push({
			content: `<span class="fa fa-info"> ${t('action.info')}</span>`,
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
			content: `<span class="fa fa-file"> ${t('action.logs')}</span>`,
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
				content: `<span class="fa fa-stop"> ${t('action.stop')}</span>`,
				select: (element: NodeSingular) => {
					node.unselect()
					const host = this.hosts.get(node.id().slice(5))
					UIkit.notification(t('notif.stopping'), {pos: 'top-right'})
					host.stop().then((actionStatus) => {
						if(actionStatus == HostActionStatus.notSupported) {
							UIkit.modal.alert(t('error.stopNotSupported'))
						} else if(actionStatus == HostActionStatus.fail) {
							UIkit.modal.alert(t('error.stopFailed'))
						} else {
							UIkit.notification(t('notif.hostStopped'), {pos: 'top-right'})
						}
					})
				}
			})
			commands.push({
				content: `<span class="fa fa-redo"> ${t('action.restart')}</span>`,
				select: (element: NodeSingular) => {
					node.unselect()
					const host = this.hosts.get(node.id().slice(5))
					const notification = UIkit.notification(`${t('notif.restarting')} <div uk-spinner></div>`, {pos: 'top-right', timeout: 0})
					host.stop().then((actionStatus) => {
						if(actionStatus == HostActionStatus.notSupported) {
							UIkit.modal.alert(t('error.restartNotSupported'))
						} else if(actionStatus == HostActionStatus.fail) {
							UIkit.modal.alert(t('error.failed'))
						} else {
							host.start().then((actionStatus) => {
								notification.close(true)
								if(actionStatus == HostActionStatus.notSupported) {
									UIkit.modal.alert(t('error.startNotSupported'))
								} else if(actionStatus == HostActionStatus.fail) {
									UIkit.modal.alert(t('error.restartFailed'))
								} else {
									UIkit.notification(`${element.data('name')} ${t('notif.restarted')}`, {pos: 'top-right'})
								}
							})
						}
					})
				}
			})
			commands.push({
				content: `<span class="fa fa-terminal"> ${t('action.shell')}</span>`,
				select: (element: NodeSingular) => {
					const hostId = node.id().slice(5)
					// Reattach to a still-running session instead of spawning a new shell.
					const existing = this.terminalSessions.get(hostId)
					if (existing && existing.socket.readyState === WebSocket.OPEN) {
						this.openTerminalDialog(hostId)
						return
					}
					UIkit.modal.prompt(t('prompt.shellCommand'), '/bin/sh').then((command) => {
						if (command && command.length > 0) {
							this.hosts.get(hostId).getExecTerminal(command).then(({ term, socket }) => {
								this.terminalSessions.set(hostId, { term, socket, opened: false })
								// Clear the session (and the node badge) once the shell really ends.
								socket.addEventListener('close', () => this.terminalSessions.delete(hostId))
								this.openTerminalDialog(hostId)
							})
						}
					})
				}
			});
		}
		if (node.data().state == 'stopped' || node.data().state == 'suspended') {
			commands.push({
				content: `<span class="fa fa-play"> ${t('action.start')}</span>`,
				select: (element: NodeSingular) => {
					node.unselect()
					const host = this.hosts.get(node.id().slice(5))
					host.start().then((actionStatus) => {
						if(actionStatus == HostActionStatus.notSupported) {
							UIkit.modal.alert(t('error.startNotSupported'))
						} else if(actionStatus == HostActionStatus.fail) {
							UIkit.modal.alert(t('error.failed'))
						} else {
							UIkit.notification(t('notif.hostStarted'), {pos: 'top-right'})
						}
					})
				}
			})
		}
		if (node.data().state == 'stopped') {
			commands.push({
				content: `<span class="fa fa-trash"> ${t('action.delete')}</span>`,
				select: (element: NodeSingular) => {
					node.unselect()
					const host = this.hosts.get(node.id().slice(5))
					host.delete().then((actionStatus) => {
						if(actionStatus == HostActionStatus.notSupported) {
							UIkit.modal.alert(t('error.notImplemented'))
						} else if(actionStatus == HostActionStatus.fail) {
							UIkit.modal.alert(t('error.failed'))
						} else {
							UIkit.modal.alert(t('notif.hostDeleted'))
						}
					})
				}
			})
		}
		return commands
	}

	// Context menu for edges (links between containers)
	edgeMenuOptions = (edge: NodeSingular) => {
		// Only L7 links (container <-> container) carry a "why" explanation
		if (edge.data('type') != 'l7link') {
			return []
		}

		return [{
			content: `<span class="fa fa-info"> ${t('action.linkReason')}</span>`,
			select: (element: NodeSingular) => {
				const reasons: any[] = element.data('reasons') || []
				const sourceName = element.data('sourceName')
				const targetName = element.data('targetName')

				let body: string
				if (reasons.length == 0) {
					body = `<p class="uk-text-muted">${t('link.noReason')}</p>`
				} else {
					let cards = ''
					for (const reason of reasons) {
						const details: string[] = []
						if (reason.envKey) {
							const value = reason.envValue ? `<code class="uk-text-break"> = ${reason.envValue}</code>` : ''
							details.push(`<dt><span uk-icon="icon: cog; ratio: 0.8"></span> ${t('link.envVar')}</dt><dd><span class="uk-label">${reason.envKey}</span>${value}</dd>`)
						}
						if (reason.alias) {
							details.push(`<dt><span uk-icon="icon: tag; ratio: 0.8"></span> ${t('link.dnsAlias')}</dt><dd><span class="uk-label uk-label-success">${reason.alias}</span></dd>`)
						}
						if (reason.network) {
							details.push(`<dt><span uk-icon="icon: cloud-download; ratio: 0.8"></span> ${t('link.network')}</dt><dd><span class="uk-label uk-label-warning">${reason.network}</span></dd>`)
						}
						cards += `
							<div class="uk-card uk-card-default uk-card-small uk-card-body uk-margin-small-bottom">
								<p class="uk-margin-small-bottom">${reason.description}</p>
								<dl class="uk-description-list">${details.join('')}</dl>
							</div>`
					}
					body = cards
				}

				const element$ = UIkitUtil.$(
					`<div class="uk-modal link-reason-modal">
						<div class="uk-modal-dialog">
							<button class="uk-modal-close-default" type="button" uk-close></button>
							<div class="uk-modal-header">
								<h2 class="uk-modal-title">
									<span uk-icon="icon: link"></span>
									${sourceName} &rarr; ${targetName}
								</h2>
							</div>
							<div class="uk-modal-body" uk-overflow-auto>
								${body}
							</div>
							<div class="uk-modal-footer uk-text-right">
								<button class="uk-button uk-button-primary uk-modal-close" type="button">${t('common.close')}</button>
							</div>
						</div>
					</div>`
				)
				const dialog: any = UIkit.modal(element$)
				dialog.show()
			}
		}]
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

	// Show (or re-show) a persistent interactive exec session. Closing the dialog
	// does NOT dispose the terminal or close the socket: the session keeps running
	// and is reattached on the next open (its scrollback is preserved). The session
	// only ends when the shell exits (socket close) or the tab is closed.
	private openTerminalDialog(hostId: string) {
		const session = this.terminalSessions.get(hostId)
		if (!session) {
			return
		}
		const dialog = this.getWideDialog('<div class="terminal"></div>')
		if (!session.fitAddon) {
			session.fitAddon = new FitAddon()
			session.term.loadAddon(session.fitAddon)
		}
		const fitAddon = session.fitAddon
		new ResizeObserver(() => { try { fitAddon.fit() } catch (e) { /* not attached */ } }).observe(dialog.content)
		UIkitUtil.on(dialog.content, 'shown', () => {
			const terminalDiv = dialog.content.getElementsByClassName('terminal')[0] as HTMLElement
			if (!session.opened) {
				session.term.open(terminalDiv)
				session.opened = true
			} else if (session.term.element) {
				// Move the already-rendered terminal (with its buffer) into the new dialog.
				terminalDiv.appendChild(session.term.element)
			}
			fitAddon.fit()
			session.term.focus()
		})
		dialog.dialog.show()
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

	public getNameFilter(): string {
		const element = <HTMLInputElement> document.getElementById('menu-filter-name')
		return element ? element.value.trim().toLowerCase() : ''
	}

	// Maps each status checkbox to the host state it controls
	static statusFilters: { [id: string]: string } = {
		'menu-filter-status-healthy': 'running',
		'menu-filter-status-unhealthy': 'unhealthy',
		'menu-filter-status-exited': 'stopped'
	}

	// Returns the set of host states that should be hidden.
	// Only states backed by a checkbox can be hidden; any other state always shows.
	public getHiddenStates(): Set<string> {
		const hidden = new Set<string>()
		for (const id in Infrastructure.statusFilters) {
			const element = <HTMLInputElement> document.getElementById(id)
			if (element && !element.checked) {
				hidden.add(Infrastructure.statusFilters[id])
			}
		}
		return hidden
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
		const modulesReturns: Promise<void>[] = []
		for (const module of this.modules) {
			let hostsPromise: Promise<Host[]>
			if ('getHosts' in (module as any)) {
				hostsPromise = (module as HostModule).getHosts()
				modulesReturns.push(this.updateHosts(hostsPromise))
			}
			if ('getNetworks' in (module as any)) {
				modulesReturns.push(this.updateNetworks((module as NetworkModule).getNetworks()))
			}
			if ('getLinks' in (module as any)) {
				if (hostsPromise) {
					modulesReturns.push(this.updateLinks((module as LinkModule).getLinks(hostsPromise)))
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
		const nameFilter = this.getNameFilter()
		const hiddenStates = this.getHiddenStates()
		const visibleHostIds = new Set<string>()
		const visibleNetworkIds = new Set<string>()

		if (this.getOption('menu-display-networks', 'boolean')) {
			// Networks
			for (const network of this.networks.values()) {
				visibleNetworkIds.add("network-" + network.id)
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
			if (nameFilter && !host.name.toLowerCase().includes(nameFilter)) {
				return
			}
			if (hiddenStates.has(host.state)) {
				return
			}
			visibleHostIds.add("host-" + host.id)
			const hasTerminal = this.terminalSessions.has(host.id)
			nodesDefinitions.push({
				data: {
					id: "host-" + host.id,
					name: host.name,
					// "#!" shebang marker shown inside the node while a shell is open.
					label: (hasTerminal ? '#! ' : '') + host.name,
					hasTerminal: hasTerminal,
					state: host.state,
					type: "host"
				}
			});
			if (this.getOption('menu-display-networks', 'boolean')) {
				for (const network of Object.values(host.getNetworks())) {
					if (!visibleNetworkIds.has("network-" + network.id)) {
						continue
					}
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
				if (!visibleHostIds.has('host-' + link.source.id) || !visibleHostIds.has('host-' + link.target.id)) {
					continue
				}
				edgesDefinitions.push({
					data: {
						id: 'host-'+link.source.id + " -> host-" + link.target.id,
						source: 'host-'+link.source.id,
						target: 'host-'+link.target.id,
						type: 'l7link',
						sourceName: link.source.name,
						targetName: link.target.name,
						reasons: link.reasons || []
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
