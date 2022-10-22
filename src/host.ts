import { Module } from './datasources/index'
import { Network } from './network'
import { Terminal } from 'xterm'

export enum HostState {
	running = 'running',
	stopped = 'stopped',
	unhealthy = 'unhealthy',
	suspended = 'suspended',
	unknown = 'unknown'
}

export enum HostActionStatus {
	notSupported,
	success,
	fail
}

export type LogStreamType = 'stdout' | 'stderr' | 'stdin'

export type LogLine = {
	stream: LogStreamType
	timestamp: Date
	data: string
}

export class Host {
	id: string
	name: string
	data: {[key: string]: any }
	dns: string[]
    state: HostState
	provider: HostModule
	networks: { [key: string]: Network };

	constructor(id: string, name: string, dns: string[], state: HostState, provider: HostModule, data: {[key: string]: any } ) {
		this.id = id
		this.name = name
		this.data = data
		this.dns = dns
		this.state = state
		this.provider = provider
		this.networks = {}
	}
	stop(): Promise<HostActionStatus> {
		return this.provider.stopHost(this.id)
	}
	start(): Promise<HostActionStatus> {
		return this.provider.startHost(this.id)
	}
	delete(): Promise<HostActionStatus> {
		return this.provider.deleteHost(this.id)
	}
	pause(): Promise<HostActionStatus> {
		return this.provider.pauseHost(this.id)
	}
	getLogs(): Promise<LogLine[] | Terminal> {
		return this.provider.getHostLogs(this.id)
	}
	executeCommand(command: string): Promise<LogLine[] | Terminal> {
		return this.provider.executeCommand(this.id, command)
	}
	getTerminal(): Promise<Terminal> {
		return this.provider.getHostTerminal(this.id)
	}
	getInfos(): any {
		return this.data
	}
	getNetworks(): { [key: string]: Network } {
		return this.networks
	}
	addNetwork(network: Network): void {
		this.networks[network.id] = network
		network.addHost(this)
	}

}

export interface HostModule extends Module {
	getHosts(): Promise<Host[]>
	stopHost(id: string): Promise<HostActionStatus>
	startHost(id: string): Promise<HostActionStatus>
	pauseHost(id: string): Promise<HostActionStatus>
	deleteHost(id: string): Promise<HostActionStatus>
	getHostLogs(id: string, tailAfter?: Date): Promise<Terminal | LogLine[]>
	getHostTerminal(id: string): Promise<Terminal>
	executeCommand(id: string, command: string): Promise<Terminal | LogLine[]>
}
