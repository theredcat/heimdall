export class Logger {
	name: string
	constructor(name: string) {
		this.name = name
	}
	debug(log: string) {
		console.debug('debug['+this.name+']: '+log)
	}
	info(log: string) {
		console.log('info['+this.name+']: '+log)
	}
	warn(log: string) {
		console.log('warn['+this.name+']: '+log)
	}
	error(log: string) {
		console.error('error['+this.name+']: '+log)
	}
}
