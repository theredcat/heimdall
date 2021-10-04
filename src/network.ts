import { Module } from './datasources/index';
import { Host } from './host'

export class Network {
	id: string
	name: string
	hosts: { [key: string]: Host }
	data: {[key: string]: any }

	private static instances: Map<string, Network>

	constructor(id: string, name: string, data: {[key: string]: any } ) {
		if (id.length == 0){
			throw new Error('Trying to create a network with empty ID')
		}
		if (typeof Network.instances == 'undefined'){
			Network.instances = new Map<string, Network>()
		}
		if (Network.instances.has(id)) {
			return Network.instances.get(id)
		}

		this.id = id
		this.name = name
		this.data = data
		this.hosts = {}
		Network.instances.set(id, this)
	}

	hasHost(host: Host): boolean {
		return host.id in this.hosts
	}

	addHost(host: Host): void {
		this.hosts[host.id] = host
	}
}

export abstract class NetworkModule extends Module {
	abstract getNetworks(): Promise<Network[]>;
}
