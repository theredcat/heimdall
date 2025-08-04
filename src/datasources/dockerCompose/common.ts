export type ContainerPort = {
	PrivatePort: number
	Type: ("tcp" | "udp")
}

export type ContainerExitStatus = {
	StatusCode: number
	Error?: any
}

export type ContainerNetwork = {
	IPAMConfig: string
	Aliases: string[]
	NetworkID: string
	EndpointId: string
	Gateway: string
	IPAddress: string
	IPPrefixLen: string
	IPv6Gateway: string
	GlobalIPv6Address: string
	GlobalIPv6PrefixLen: string
	MacAddress: string
	DriverOpts: any
}

export type DockerNetwork = {
	Name: string
	Id: string
	Created: Date
	Scope: string
	Driver: string
	EnableIPv6: boolean
	IPAM: DockerNetworkIPAM
	Internal: boolean
	Attachable: boolean
	Ingress: boolean
	ConfigFrom: any
	ConfigOnly: boolean
	Options: { [key: string]: string}
	Labels: any
}

export type DockerNetworkIPAM = {
	Driver: string
	Options: any
	Config: DockerNetworkIPAMConfig[]
}

export type DockerNetworkIPAMConfig = {
	Subnet: string
	Gateway?: string
}

export type Mount = {
	Type: string
	Source: string
	Destination: string
	Mode: string
	RW: boolean
	Propagation: string
}

export type NetworkSettings = {
	Networks: { [key: string]: ContainerNetwork }
}

export type HostConfig = {
	NetworkMode: string
}

export type State = {
	Error: string
	ExitCode: number
	FinishedAt?: Date
	OOMKilled: boolean
	Dead: boolean
	Paused: boolean
	Pid: number
	Restarting:boolean
	Running: boolean
	StartedAt?: Date
	Status: ("created"|"restarting"|"running"|"removing"|"paused"|"exited"|"dead")
	Health?: ContainerHealth
}

export type ContainerHealth = {
	Status: ("healthy"|"unhealthy")
}

export type Volume = {}

export type Config = {
	Hostname: string
	DomainName: string
	User: string
	AttachStdin: boolean
	AttachStdout: boolean
	AttachStderr: boolean
	Tty: boolean
	OpenStdin: boolean
	StdinOnce: boolean
	Env: string[]
	Cmd: string[]
	Image: string
	Volumes: {[key:string]: Volume }
	WorkingDir: string
	OnBuild: string
	Labels: {[key: string]: string}
}

export type Container = {
	AppArmorProfile: string
	Args: string[]
	Config: Config
	Created: Date
	Driver: string
	ExecIds: string[]
	HostConfig: {}
	HostnamePath: string
	HostsPath: string
	LogPath: string
	Id: string
	Image: string
	MountLabel: string
	Name: string
	NetworkSettings: NetworkSettings
	Path: string
	ProcessLabel: string
	ResolvConfPath: string
	RestartCount: number
	State: State
	Mounts: Mount[]
}

export type ExecInstance = {
	Id: string
}

export const serverConfig = {
	daemonUrl: {
		name: 'URL',
		description: 'Daemon Url',
		default:'http://localhost:8080',
	},
} as const
export type DockerComposeServerConfig = typeof serverConfig

export const clientConfig = {
	linkIndicatorDnsEnvironmentVariable: {
		name: 'Use DNS in env vars',
		description: 'Match containers names or network aliases in other containers environment variables to create links',
		default: false,
	},
	cacheTime: {
		name: 'Data cache',
		description: 'Time in milliseconds to cache containers and networks data',
		default: 2000,
	},
} as const
export type DockerComposeClientConfig = typeof clientConfig
