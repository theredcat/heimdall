import { Request } from './request'

export class Config {
	config: any = null
	httpClient: Request

	constructor() {
		this.httpClient = new Request(new URL(document.URL))
	}

	async get(name: string): Promise<any> {
		if (this.config === null) {
			const response = await fetch('./config.json', { cache: 'no-store' })
			this.config = await response.json()
		}
		return this.config[name]
	}
}
