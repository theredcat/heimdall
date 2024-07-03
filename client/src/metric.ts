import { Module } from './datasources/index'
import { Host } from './host'
export type Metric = {
	host: Host
	name: string
	value: Array<number>
};

export abstract class MetricsModule extends Module{
	getMetrics(hostsPromise: Promise<Host[]>) {
		return hostsPromise.then((hosts) => {
			return hosts.map(this.getMetric);
		})
	}

	abstract getMetric(host: Host): Promise<Metric[]>
}
