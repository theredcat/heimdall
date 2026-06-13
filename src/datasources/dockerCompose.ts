import { Terminal, IDisposable, ITerminalAddon } from '@xterm/xterm';
import { Host, HostActionStatus, HostModule, HostState, LogLine, LogStreamType, ExecTerminal } from '../host'
import { Link, LinkModule, LinkReason } from '../link'
import { Network, NetworkModule } from '../network'
import { Module } from './index'
import { AttachAddon } from '@xterm/addon-attach'

type ContainerPort = {
	PrivatePort: number
	Type: ("tcp" | "udp")
}

type ContainerExitStatus = {
	StatusCode: number
	Error?: any
}

type ContainerNetwork = {
	IPAMConfig: string
	Aliases: string[]
	NetworkID: string
	EndpointId: string
	Gateway: string
	IPAddress: string
	IPPrefixLen: string
	IPv6Gateway: string
	GlobalIPv6Address: string
	GlobalIPv6PrefixLen: string
	MacAddress: string
	DriverOpts: any
}

type DockerNetwork = {
	Name: string
	Id: string
	Created: Date
	Scope: string
	Driver: string
	EnableIPv6: boolean
	IPAM: DockerNetworkIPAM
	Internal: boolean
	Attachable: boolean
	Ingress: boolean
	ConfigFrom: any
	ConfigOnly: boolean
	Options: { [key: string]: string}
	Labels: any
}

type DockerNetworkIPAM = {
	Driver: string
	Options: any
	Config: DockerNetworkIPAMConfig[]
}

type DockerNetworkIPAMConfig = {
	Subnet: string
	Gateway?: string
}

type Mount = {
	Type: string
	Source: string
	Destination: string
	Mode: string
	RW: boolean
	Propagation: string
}

type NetworkSettings = {
	Networks: { [key: string]: ContainerNetwork }
}

type HostConfig = {
	NetworkMode: string
}

type State = {
	Error: string
	ExitCode: number
	FinishedAt?: Date
	OOMKilled: boolean
	Dead: boolean
	Paused: boolean
	Pid: number
	Restarting:boolean
	Running: boolean
	StartedAt?: Date
	Status: ("created"|"restarting"|"running"|"removing"|"paused"|"exited"|"dead")
	Health?: ContainerHealth
}

type ContainerHealth = {
	Status: ("healthy"|"unhealthy")
}

type Volume = {}

type Config = {
	Hostname: string
	DomainName: string
	User: string
	AttachStdin: boolean
	AttachStdout: boolean
	AttachStderr: boolean
	Tty: boolean
	OpenStdin: boolean
	StdinOnce: boolean
	Env: string[]
	Cmd: string[]
	Image: string
	Volumes: {[key:string]: Volume }
	WorkingDir: string
	OnBuild: string
	Labels: {[key: string]: string}
}

type Container = {
	AppArmorProfile: string
	Args: string[]
	Config: Config
	Created: Date
	Driver: string
	ExecIds: string[]
	HostConfig: {}
	HostnamePath: string
	HostsPath: string
	LogPath: string
	Id: string
	Image: string
	MountLabel: string
	Name: string
	NetworkSettings: NetworkSettings
	Path: string
	ProcessLabel: string
	ResolvConfPath: string
	RestartCount: number
	State: State
	Mounts: Mount[]
}

type ExecInstance = {
	Id: string
}

export class DockerCompose extends Module implements HostModule, NetworkModule, LinkModule {
	project: string
	containers: Promise<Container[]>
	networks: Promise<DockerNetwork[]>
	linkIndicatorLabelPrefix: string = ''
	linkIndicatorDnsEnvironmentVariable: boolean = false
	containersCacheTimestamp: number = 0
	networksCacheTimestamp: number = 0
	cacheTime:number = 2000

	constructor(
		url: URL,
		linkIndicatorLabelPrefix?: string,
		linkIndicatorDnsEnvironmentVariable?: boolean,
	) {
		super('dockerCompose', url);

		if(linkIndicatorLabelPrefix)
			this.linkIndicatorLabelPrefix = linkIndicatorLabelPrefix;

		if(linkIndicatorDnsEnvironmentVariable)
			this.linkIndicatorDnsEnvironmentVariable = true;
	}

	getHostFromContainer(container: Container): Host {
		let hostStatus: HostState

		if (container.State.Status == 'running' && container.State.Health) {
		   	if (container.State.Health.Status == 'healthy') {
				hostStatus = HostState.running
			} else {
				hostStatus = HostState.unhealthy
			}
		} else if (container.State.Status == 'running') {
			hostStatus = HostState.running
		} else if (container.State.Status == 'paused') {
			hostStatus = HostState.suspended
		} else if (container.State.Status == 'exited') {
			hostStatus = HostState.stopped
		} else {
			hostStatus = HostState.unknown
		}

		const host = new Host(
			container.Id,
			container.Name,
			[].concat(Object.values(container.NetworkSettings.Networks).map((network) => {
				return network.Aliases
			})),
			hostStatus,
			this,
			container,
		)
		
		// Created containers don't have a valid network object because they have never been started
		if (container.State.Status != "created") {
			for (const [networkName, dockerNetwork] of Object.entries(container.NetworkSettings.Networks)) {
				const network = new Network(
					dockerNetwork.NetworkID,
					networkName,
					{},
				)
				host.addNetwork(network)
			}
		} else {
			this.logger.debug(`Skipping networks for container ${container.Id} because of it's "created" state`)
		}

		return host
	}

	getContainers(): Promise<Container[]> {
		const now = new Date().getTime()
		if (!this.containers || now - this.containersCacheTimestamp > this.cacheTime) {
			this.containersCacheTimestamp = now
			this.containers = this.httpClient.get<any[]>('/containers/json?all=true').then((containersResponse) => {
				let containerIds: string[] = containersResponse.map((container) => {
					return container.Id
				})
				let containerPromises: Promise<Container>[] = []
				for (let containerId of containerIds) {
					containerPromises.push(
						this.httpClient.get<Container>('/containers/'+containerId+'/json').then((container) => {
							container.Name = container.Name.substring(1)
							this.logger.debug('Loaded container'+container.Name)
							return container
						})
					)
				}
				return Promise.all<Container>(containerPromises)
			})
		}

		return this.containers
	}

	getDockerNetworks(): Promise<DockerNetwork[]> {
		const now = new Date().getTime()
		if (!this.networks || now - this.networksCacheTimestamp > this.cacheTime) {
			this.networks = this.httpClient.get<DockerNetwork[]>('/networks').then((networksResponse) => {
				return networksResponse
			})
		}

		return this.networks
	}

	// Hosts
	getHosts(): Promise<Host[]> {
		return this.getContainers().then((containersResponse) => {
			let containers: Host[] = []
			for (let container of containersResponse) {
				containers.push(this.getHostFromContainer(container))
			}
			return containers
		})
	}

	deleteHost(id: string): Promise<HostActionStatus> {
		return new Promise<HostActionStatus>((resolve,reject) => resolve(HostActionStatus.notSupported))
	}

	stopHost(id: string): Promise<HostActionStatus> {
		return this.httpClient.post<null>(
				`/containers/${id}/stop`,
				'{}'
			)
			.then(() => {
				return this.httpClient.post<ContainerExitStatus>(
					`/containers/${id}/wait`,
					'{}'
				)
				.then(() => {
					return new Promise<HostActionStatus>((resolve,reject) => resolve(HostActionStatus.success))
				})
				.catch((reason) => {
					return new Promise<HostActionStatus>((resolve,reject) => resolve(HostActionStatus.fail))
				})
			})
			.catch((reason) => {
				return new Promise<HostActionStatus>((resolve,reject) => resolve(HostActionStatus.fail))
			})
	}

	startHost(id: string): Promise<HostActionStatus> {
		return this.httpClient
			.post<null>(
				`/containers/${id}/start`,
				'{}'
			)
			.then(() => {
				return new Promise<HostActionStatus>((resolve,reject) => resolve(HostActionStatus.success))
			})
			.catch((reason) => {
				return new Promise<HostActionStatus>((resolve,reject) => resolve(HostActionStatus.fail))
			})
	}

	pauseHost(id: string): Promise<HostActionStatus> {
		return this.httpClient
			.post<null>(
				`/containers/${id}/pause`,
				'{}'
			)
			.then(() => {
				return new Promise<HostActionStatus>((resolve,reject) => resolve(HostActionStatus.success))
			})
			.catch((reason) => {
				return new Promise<HostActionStatus>((resolve,reject) => resolve(HostActionStatus.fail))
			})
	}

	getHostTerminal(id: string): Promise<Terminal> {
		const host = this.httpClient.baseUrl.host
		const pathname = this.httpClient.baseUrl.pathname
		const protocol = this.httpClient.baseUrl.protocol.replace('http','ws')
		const url = `${protocol}//${host}${pathname}containers/${id}/attach/ws?logs=0&stream=1&stdin=1&stdout=1&stderr=1`
		const socket = new WebSocket(url)
		const term = new Terminal({convertEol: true})
		const attachAddon = new AttachAddon(socket)
		term.loadAddon(attachAddon);
		return new Promise<Terminal>((resolve,reject) => resolve(term))
	}

	getHostLogs(id: string, tailAfter?: Date): Promise<Terminal | LogLine[]> {
		const host = this.httpClient.baseUrl.host
		const pathname = this.httpClient.baseUrl.pathname
		const protocol = this.httpClient.baseUrl.protocol.replace('http','ws')
		const url = `${protocol}//${host}${pathname}containers/${id}/attach/ws?logs=1&stream=1&stdin=0&stdout=1&stderr=1`
		this.logger.debug(`Connecting to docker logs websocket : ${url}`)
		const socket = new WebSocket(url)
		const term = new Terminal({convertEol: true})
		const attachAddon = new AttachAddon(socket)
		term.loadAddon(attachAddon);
		return new Promise<Terminal>((resolve,reject) => resolve(term))
	}

	// Interactive `docker exec -it` via the server-side WS bridge at /terminal.
	// The bridge (not under /docker/) translates the WebSocket to Docker's exec
	// hijack, so we wire xterm manually: stdin as binary frames, resize as JSON
	// text frames, and raw PTY bytes straight back into the terminal.
	getHostExecTerminal(id: string, command: string = '/bin/sh'): Promise<ExecTerminal> {
		const loc = window.location
		const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:'
		const url = `${protocol}//${loc.host}/terminal?id=${encodeURIComponent(id)}&cmd=${encodeURIComponent(command)}&tty=1`
		const socket = new WebSocket(url)
		socket.binaryType = 'arraybuffer'
		const term = new Terminal({ convertEol: false })
		const encoder = new TextEncoder()

		socket.onmessage = (ev) => {
			if (typeof ev.data === 'string') {
				term.write(ev.data)
			} else {
				term.write(new Uint8Array(ev.data as ArrayBuffer))
			}
		}
		socket.onopen = () => {
			// Size the PTY to the terminal as soon as the connection is up.
			socket.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
		}
		socket.onclose = () => {
			try { term.write('\r\n\x1b[90m[session closed]\x1b[0m\r\n') } catch (e) { /* disposed */ }
		}
		term.onData((data) => {
			if (socket.readyState === WebSocket.OPEN) socket.send(encoder.encode(data))
		})
		term.onResize(({ cols, rows }) => {
			if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'resize', cols, rows }))
		})

		return new Promise<ExecTerminal>((resolve) => resolve({ term, socket }))
	}

	// Networks
	getNetworks(): Promise<Network[]> {
		return this.getDockerNetworks().then((networkResponse) => {
			let networks: Network[] = []
			for (let network of networkResponse) {
				networks.push(new Network(network.Id, network.Name, network))
			}
			return Object.values(networks)
		})
	}

	getLinks(): Promise<Link[]> {
		return this.getContainers().then((containersResponse) => {
			let links: { [key: string]: Link } = {}
			let dnsContainers: { [key: string]: [Network, Host] } = {}
			for (let container of containersResponse) {
				for (let networkName in container.NetworkSettings.Networks) {
					let network = container.NetworkSettings.Networks[networkName]
					if (network.Aliases){
						for(let alias of network.Aliases) {
							let networkLink: Network = null
							if (network.NetworkID) {
								networkLink = new Network(network.NetworkID, networkName, network)
							}
							dnsContainers[alias] = [
								networkLink,
								this.getHostFromContainer(container),
							]
						}
					}
				}
			}
			for (let container of containersResponse) {
				if(this.linkIndicatorDnsEnvironmentVariable) {
					for (let envKeyValue of container.Config.Env) {
						let envValue = envKeyValue.match('^([^=]+)=(.*)$')
						if (!envValue)
							continue

						const envKey = envValue[1]
						for(let dnsContainer in dnsContainers) {
							if(envValue[2].match(dnsContainer)){
								const source = this.getHostFromContainer(container)
								const target = dnsContainers[dnsContainer][1]
								const via = dnsContainers[dnsContainer][0]
								this.logger.debug(`Adding link from Container{Id=${source.id}} to Container{Id=${target.id}} because source container environment variable contains a reference to one of the target container DNS alias (${dnsContainer})`)
								const reason: LinkReason = {
									type: 'env',
									description: `Environment variable ${envKey} of ${source.name} references the DNS alias "${dnsContainer}" of ${target.name}`,
									envKey: envKey,
									envValue: envValue[2],
									alias: dnsContainer,
									network: via ? via.name : undefined,
								}
								const linkKey = source.id + ':' + target.id
								if (links[linkKey]) {
									links[linkKey].reasons.push(reason)
									if (via) {
										links[linkKey].via.push(via)
									}
								} else {
									links[linkKey] = {source, target, via: via ? [via] : [], reasons: [reason]}
								}
							}
						}

					}
				}
			}
			return Object.values(links)
		})
	}
}
