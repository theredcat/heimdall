import { Request } from './request'

export class Config {
	config: any = null
	httpClient: Request

	constructor() {
		this.httpClient = new Request(new URL(document.URL))
	}

	private async refreshCache() {
		await this.httpClient.get('config.json').then((config) => {
			this.config = config
			return Promise.resolve(null)
		})
	}

	async get(name: string): Promise<any> {
		if (this.config === null) {
			await this.refreshCache()
		}
		return this.config[name]
	}
}
