import { split } from 'shlex'
import { Terminal, IDisposable, ITerminalAddon } from '@xterm/xterm';
import { Host, HostActionStatus, HostModule, HostState, LogLine, LogStreamType } from '../host'
import { Link, LinkModule } from '../link'
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

	private parseDockerStream(buffer: ArrayBuffer): Uint8Array {
		let bufferPointer = 0
		let output = new Uint8Array()
		const dv = new DataView(buffer)
		while(bufferPointer < buffer.byteLength) {
			// Docker stream protocol decoder
			// First byte is stream type
			const streamId = dv.getUint8(bufferPointer)
			let streamType: LogStreamType
			switch(streamId){
				case 0: streamType = <LogStreamType>'stdin'; break
				case 1: streamType = <LogStreamType>'stdout'; break
				case 2: streamType = <LogStreamType>'stderr'; break
				default: throw Error(`Error while parsing docker log line. Stream id should be 0, 1 or 2 but got ${streamId}`)
			}
			bufferPointer++;
			// Bytes 2 3 and 4 are always zero
			bufferPointer += 3;
			// Bytes 5 6 7 and 8 are a 32 bits unsigned int with the packet length
			const packetLength = dv.getUint32(bufferPointer)
			bufferPointer += 4;
			const packetBuffer = new Uint8Array(dv.buffer, bufferPointer, packetLength)
			const newOutput = new Uint8Array(output.length + packetBuffer.length )
			newOutput.set(output)
			newOutput.set(packetBuffer, output.length)
			output = newOutput
			bufferPointer += packetLength
		}
		return output
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
		const domain = this.httpClient.baseUrl.hostname
		const pathname = this.httpClient.baseUrl.pathname
		const protocol = this.httpClient.baseUrl.protocol.replace('http','ws')
		const url = `${protocol}//${domain}${pathname}containers/${id}/attach/ws?logs=0&stream=1&stdin=1&stdout=1&stderr=1`
		const socket = new WebSocket(url)
		const term = new Terminal({convertEol: true})
		const attachAddon = new AttachAddon(socket)
		term.loadAddon(attachAddon);
		return new Promise<Terminal>((resolve,reject) => resolve(term))
	}

	getHostLogs(id: string, tailAfter?: Date): Promise<Terminal | LogLine[]> {
		const domain = this.httpClient.baseUrl.hostname
		const pathname = this.httpClient.baseUrl.pathname
		const protocol = this.httpClient.baseUrl.protocol.replace('http','ws')
		const url = `${protocol}//${domain}${pathname}containers/${id}/attach/ws?logs=1&stream=1&stdin=0&stdout=1&stderr=1`
		const socket = new WebSocket(url)
		const term = new Terminal({convertEol: true})
		const attachAddon = new AttachAddon(socket)
		term.loadAddon(attachAddon);
		return new Promise<Terminal>((resolve,reject) => resolve(term))
	}

	executeCommand(id: string, command: string): Promise<Terminal | LogLine[]> {
		return this.httpClient
			.post<ExecInstance>(
				`/containers/${id}/exec`,
				{
					AttachStdin: false,
					AttachStdout: true,
					AttachStderr: true,
					Tty: false,
					Cmd: split(command),
				}
			)
			.then((execInstance) => {
				return this.httpClient
					.post<ArrayBuffer>(
						`/exec/${execInstance.Id}/start`,
						'{}',
						'arraybuffer'
					).then((data) => {
						console.log(typeof data)
						const term = new Terminal({convertEol: true})
						const parsedData = this.parseDockerStream(data)
						term.write(parsedData)
						return new Promise<Terminal>((resolve,reject) => resolve(term))
					})
			})
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
			let links: Link[] = []
			let dnsContainers: { [key: string]: [Network, Host] } = {}
			for (let container of containersResponse) {
				for (let networkName in container.NetworkSettings.Networks) {
					let network = container.NetworkSettings.Networks[networkName]
					if (network.Aliases){
						for(let alias of network.Aliases) {
							let networkLink: Network = null
							if (network.NetworkID) {
								const networkLink = new Network(network.NetworkID, networkName, network)
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
						let envValue = envKeyValue.match('^[^=]+=(.*)$')
						if (!envValue)
							continue

						for(let dnsContainer in dnsContainers) {
							if(envValue[1].match(dnsContainer)){
								const source = this.getHostFromContainer(container)
								const target = dnsContainers[dnsContainer][1]
								const via = dnsContainers[dnsContainer][0]
								this.logger.debug(`Adding link from Container{Id=${source.id}} to Container{Id=${target.id}} because source container environment variable contains a reference to one of the target container DNS alias (${dnsContainer})`)
								links.push({source, target, via: [via]})
							}
						}

					}
				}
			}
			return links
		})
	}
}
