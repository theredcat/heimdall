import { EventEmitter } from 'events'
import { Logger } from '../logger.ts'
import { Request } from '../request.ts'
import { Network, NetworkModule } from '@src/network.ts';
import { Host } from '@src/host.ts';
import { Link } from '@src/link.ts';

export type Setting<T extends string | number | boolean = string | number | boolean> = {
  name: string;
  description?: string;
  default: T;
};

type ExtractSettingType<S> = S extends Setting<infer T> ? T : never;

export type ConfigInstance<TSettings extends Record<string, Setting>> = {
  [K in keyof TSettings]: ExtractSettingType<TSettings[K]>;
};

export function createConfig<TSettings extends Record<string, Setting>>(moduleName: string, settings: TSettings): ConfigInstance<TSettings> {
  const storageKey = `heimdall-${moduleName}`;

  const load = (): ConfigInstance<TSettings> => {
    const raw = localStorage.getItem(storageKey);
    const result = {} as ConfigInstance<TSettings>;
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        for (const key in settings) {
          result[key as keyof TSettings] = parsed[key] ?? settings[key].default;
        }
      } catch {
        for (const key in settings) {
		  result[key as keyof TSettings] = settings[key].default as ExtractSettingType<TSettings[typeof key]>;
        }
      }
    } else {
      for (const key in settings) {
		result[key as keyof TSettings] = settings[key].default as ExtractSettingType<TSettings[typeof key]>;
      }
    }
    return result;
  };

  let config = load();

  const save = () => {
    localStorage.setItem(storageKey, JSON.stringify(config));
  };

  window.addEventListener('storage', (e) => {
    if (e.key === storageKey) {
      config = load();
    }
  });

  const proxy = new Proxy(config, {
    get(target, prop: string | symbol) {
      if (typeof prop === 'string') {
        return target[prop as keyof ConfigInstance<TSettings>];
      }
      return undefined;
    },
    set(target, prop: string | symbol, value: any) {
      if (typeof prop === 'string') {
        target[prop as keyof ConfigInstance<TSettings>] = value;
        save();
      }
      return true;
    }
  });

  return proxy as ConfigInstance<TSettings>;
}

export abstract class ClientModule<C extends Record<string, Setting>> extends EventEmitter {
  logger: Logger
  config: ConfigInstance<C>
  serverModule: ServerModule<Record<string, Setting>> | undefined

  constructor(moduleName: string, config: C, serverModule?: ServerModule<Record<string, Setting>>) {
    super();
    this.logger = new Logger(new.target.name);
    this.config = createConfig(moduleName, config);
    if (serverModule) {
      this.serverModule = serverModule;
    }
  }
}

export abstract class ServerModule<C extends Record<string, Setting>> {
	readonly name: string
    logger: Logger
    config: ConfigInstance<C>
	constructor(moduleName: string, config: C) {
		this.logger = new Logger(new.target.name);
		this.config = createConfig(moduleName, config);
		this.name = moduleName
	}
	abstract handleRequest(params: any[]): any
}
