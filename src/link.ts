import { Module } from './datasources/index';
import { Host } from './host'
import { Network } from './network'

export type Link = {
	source: Host
	target: Host
	via?: Network[]
};

export interface LinkModule extends Module {
	getLinks(hosts: Promise<Host[]>): Promise<Link[]>;
}
