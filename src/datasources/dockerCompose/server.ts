import { ServerModule } from '../index.ts'
import { DockerComposeServerConfig, serverConfig } from './common.ts'

export class DockerComposeServer extends ServerModule<DockerComposeServerConfig> {
  constructor() {
    super('dockerCompose', serverConfig)
  }

  handleRequest(params: any[]): any {
    return
  }
}
