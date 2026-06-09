import { Module } from './datasources/index';
import { Host } from './host'
import { Network } from './network'

export type LinkReason = {
	type: 'env'
	// Human readable explanation of why this link exists
	description: string
	// The environment variable key on the source container that caused the link
	envKey?: string
	// The value of that environment variable
	envValue?: string
	// The DNS alias of the target container that was matched
	alias?: string
	// The network the alias is reachable through
	network?: string
};

export type Link = {
	source: Host
	target: Host
	via?: Network[]
	reasons?: LinkReason[]
};

export interface LinkModule extends Module {
	getLinks(hosts: Promise<Host[]>): Promise<Link[]>;
}
