import { ClientModule, Setting } from './datasources/index.ts'
import { Host } from './host.ts'

export class Network {
	id: string
	name: string
	hosts: { [key: string]: Host }
	data: { [key: string]: any }

	private static instances: Map<string, Network>

	private constructor(id: string, name: string, data: { [key: string]: any }) {
		this.id = id
		this.name = name
		this.data = data
		this.hosts = {}
	}

	static getInstance(id: string, name: string, data: { [key: string]: any }): Network {
		if (!id || id.length === 0) {
			throw new Error('Trying to create a network with empty ID')
		}

		let instance = this.instances.get(id)
		if (instance) {
			return instance
		}

		instance = new Network(id, name, data)
		this.instances.set(id, instance)
		return instance
	}

	hasHost(host: Host): boolean {
		return host.id in this.hosts
	}

	addHost(host: Host): void {
		this.hosts[host.id] = host
	}
}

export abstract class NetworkModule<C extends Record<string, Setting<string | number | boolean>>> extends ClientModule<C> {
	abstract getNetworks(): Promise<Network[]>
}
