import { ClientModule, Setting } from './datasources/index.ts';
import { Host } from './host.ts'
import { Network } from './network.ts'

export type Link = {
	source: Host
	target: Host
	via?: Network[]
};

export interface LinkModule<C extends Record<string, Setting<string | number | boolean>>> extends ClientModule<C> {
	getLinks(hosts: Promise<Host[]>): Promise<Link[]>;
}
