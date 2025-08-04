import * as fs from 'fs/promises'
import * as path from 'path'
import { Logger } from '@src/logger.ts'

export class Storage {
	private static instance: Storage | null = null
	private filepath: string
	private data: { [key: string]: any } = {}
	private logger: Logger

	private constructor(filepath: string, logger: Logger) {
		this.filepath = filepath
		this.logger = logger
	}

	static async init(): Promise<void> {
		if (this.instance) return // déjà initialisé

		const dataDir = path.resolve(__dirname, '..', 'data')
		const logger = new Logger('Storage')

		try {
			await fs.mkdir(dataDir, { recursive: true })
			logger.debug('Data directory ensured at ' + dataDir)
		} catch (err) {
			logger.error('Failed to create data directory', err)
		}

		const filepath = path.join(dataDir, `storage.json`)
		const storage = new Storage(filepath, logger)

		await storage.load()

		this.instance = storage
	}

	static getInstance(): Storage {
		if (!this.instance) {
			throw new Error('Storage is not initialized. You must call Storage.init() first.')
		}
		return this.instance
	}

	async get<V>(key: string): Promise<V | undefined> {
		return this.data[key]
	}

	async set<V>(key: string, value: V): Promise<boolean> {
		this.logger.debug(`Setting key "${key}"`, value)
		this.data[key] = value
		await this.save()
		return true
	}

	private async load() {
		try {
			const content = await fs.readFile(this.filepath, 'utf-8')
			this.data = JSON.parse(content)
			this.logger.info(`Storage loaded from ${this.filepath}`)
		} catch (error: any) {
			if (error.code !== 'ENOENT') {
				this.logger.error(`Failed to load storage from ${this.filepath}`, error)
			} else {
				this.logger.warn(`No storage file found at ${this.filepath}, starting with empty data`)
			}
			this.data = {}
		}
	}

	private async save() {
		try {
			const json = JSON.stringify(this.data, null, 2)
			await fs.writeFile(this.filepath, json, 'utf-8')
			this.logger.debug(`Storage saved to ${this.filepath}`)
		} catch (error) {
			this.logger.error(`Failed to save storage to ${this.filepath}`, error)
		}
	}
}

