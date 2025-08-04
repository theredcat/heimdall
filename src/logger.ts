export class Logger {
	name: string
	constructor(name: string) {
		this.name = name
	}
	debug(log: string, data?: any) {
		console.debug('debug['+this.name+']: '+log, data)
	}
	info(log: string, data?: any) {
		console.log('info['+this.name+']: '+log, data)
	}
	warn(log: string, data?: any) {
		console.log('warn['+this.name+']: '+log, data)
	}
	error(log: string, data?: any) {
		console.error('error['+this.name+']: '+log, data)
	}
}
