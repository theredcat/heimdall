import { HostModule } from '../host'
import { Metric } from '../metric'
import { Request } from '../request'
import { Logger } from '../logger'
import { EventEmitter } from 'events'

export abstract class Module extends EventEmitter {
	httpClient: Request
	logger: Logger
	constructor(moduleName: string, url: URL) {
		super()
		this.httpClient = new Request(url);
		this.logger = new Logger(new.target.name);
	}
}
