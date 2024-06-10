import { Request } from './request'
import config from '../config.json'

export class Config {
	config: any = null
	httpClient: Request

	constructor() {
		this.httpClient = new Request(new URL(document.URL))
		this.config = config
	}

	async get(name: string): Promise<any> {
		return this.config[name]
	}
}
