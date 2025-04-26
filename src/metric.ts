import { ClientModule, Setting } from './datasources/index.ts'
import { Host } from './host.ts'
export type Metric = {
	host: Host
	name: string
	value: Array<number>
};

export abstract class MetricsModule<C extends Record<string, Setting<string | number | boolean>>> extends ClientModule<C> {
	getMetrics(hostsPromise: Promise<Host[]>) {
		return hostsPromise.then((hosts) => {
			return hosts.map(this.getMetric);
		})
	}

	abstract getMetric(host: Host): Promise<Metric[]>
}
