import { DockerRunner } from "./runner_docker";
import { IEnvironmentDefinition } from "./manager.environment";
import * as common from './common';
import * as path from 'path';
import { VolumeManager } from "./volume_manager";

export interface IContainerDefinitionVolume {
  type: string;
  mountPoint: string;
}

export interface IContainerDefinitionPort {
  containerPort: number;
  hostPort: number;
}

export interface IContainerDefinition {
  name: string;
  image: string;

  hostRoute?: string;
  pathRoute?: string;

  volumes?: IContainerDefinitionVolume[];
  ports?: IContainerDefinitionPort[];
  env?: { [key: string]: string };
}

export interface IContainer {
  Id: string;
  Name: string;
  Created: string;
  State: {
    Status: string;
    Running: boolean;
    Paused: boolean;
    Restarting: boolean;
    Dead: boolean;
    Pid: number;
    ExitCode: number;
    Error: string;
    StartedAt: string;
    FinishedAt: string
  };
  RestartCount: number;
  Mounts: [
    {
      Type: string;
      Source: string;
      Destination: string;
    }
  ];
  Config: {
    Hostname: string;
    ExposedPorts: { [portAndProtocol: string]: any};
    Env: string[];
    Cmd: string[];
    Image: string;
    Volumes: { [mount: string]: any};
    EntryPoint: string[];
    Labels: { [key: string]: string};
  }
}
export class ContainerManager {
  static getContainerDefinitions(containerName: string): Promise<IContainerDefinition[]> {
    
    const definitionPath = path.normalize(path.join(path.normalize(__dirname), `../../containers/${containerName}.json`))
    return common.readFileAsync(definitionPath)
      .then((contents) => {
        let data = JSON.parse(contents);
        if (Array.isArray(data)) {
          return data as IContainerDefinition[];
        }
        else {
          return [data as IContainerDefinition];
        }
      })
  }

  static get TraefikProxyName(): string { return 'traefik_proxy'};

  constructor() { }

  public getContainer(environment: IEnvironmentDefinition, name: string): Promise<IContainer> {
    return DockerRunner.MakeRunner(environment)
      .then((runner) => {
        return runner
          .arg('container')
          .arg('inspect')
          .arg(`${name}`)
          .exec()
          .catch((err) => '[]')
          .then((out) => JSON.parse(out) as IContainer[])
          .then(containers => {
            if(!containers || !containers.length) { return undefined; }
            return containers[0];
          });
      });
  }

  public containerExists(environment: IEnvironmentDefinition, name: string): Promise<boolean> {
    return this.getContainer(environment, name)
      .then((container) => container !== undefined);
  }

  public createTraefik(environment: IEnvironmentDefinition): Promise<IContainer[]> {

    return this.getContainer(environment, ContainerManager.TraefikProxyName)
      .then((container) => {
        if (container) { return Promise.resolve(container); }

        return DockerRunner.MakeRunner(environment)
          .then((runner) => {
            return runner
              .arg('run')
              .arg('-d')
              .arg('-p 8080:8080')
              .arg('-p 80:80')
              .arg('-v /var/run/docker.sock:/var/run/docker.sock')
              .arg(`--name ${ContainerManager.TraefikProxyName}`)
              .arg('traefik')
              .arg('--api --docker')
              .exec()
              .then((id) => this.getContainer(environment, id));
          })
      })
      .then((c) => [c]);
  }
  
  public deleteContainer(environment: IEnvironmentDefinition, containerDefinition: string | IContainerDefinition[] | IContainerDefinition): Promise<void> {
    let definitionsPromise: Promise<IContainerDefinition[]> = undefined; 

    if (!containerDefinition) {
      return Promise.resolve();
    }

    if (typeof(containerDefinition) === 'string') {
      definitionsPromise = ContainerManager.getContainerDefinitions(containerDefinition);
    }
    else if (Array.isArray(containerDefinition)) {
      definitionsPromise = Promise.resolve(containerDefinition as IContainerDefinition[])
    }
    else {
      definitionsPromise = Promise.resolve([containerDefinition as IContainerDefinition]);
    }

    var deleteSingularContainer = (def: IContainerDefinition) => {
      return this.getContainer(environment, def.name)
        .then((container) => {
          if (!container) { return Promise.resolve(); }

          return DockerRunner.MakeRunner(environment)
          .then((runner) => {
            return runner
            .arg('rm --force')
            .arg(`${container.Id}`)
            .exec()
            .then(() => {});
          });
        })
    }

    return definitionsPromise
      .then((defs) => {
        let lastPromise: Promise<any> = Promise.resolve();

        defs.forEach(def => {
          lastPromise = lastPromise.then(() => deleteSingularContainer(def));
        });

        return lastPromise;
      });
  }

  public createGeneric(environment: IEnvironmentDefinition, containerName: string): Promise<IContainer[]> {
    let defs: IContainerDefinition[] = []; 
    let runner_: DockerRunner = undefined; 

    let createSingular = (def: IContainerDefinition) => {
      return DockerRunner.MakeRunner(environment)
        // Add basics to command line
        .then((runner) => {
          return runner
            .arg('run')
            .arg('-d')
            .arg(`--name ${def.name}`)
        })

        .then((runner) => this.runner_addLabels(runner, def))
        .then((runner) => this.runner_addVolumes(runner, def))
        .then((runner) => this.runner_addPorts(runner, def))
        .then((runner) => this.runner_addEnvironmentVariables(runner, def))

        // Add image at end of command line
        .then((runner) => { 
          return runner.arg(def.image)
        })

        .then((runner) => { runner.outputCommand(); return runner; })
        .then((runner) => runner.exec())
        .then((id) => this.getContainer(environment, id))
    }

    return ContainerManager.getContainerDefinitions(containerName)
      .then((d) => { defs = d; })
      .then(() => {
        let results: IContainer[] = [];

        let lastPromise: Promise<any> = Promise.resolve();
        defs.forEach(d => {
          lastPromise = lastPromise.then(() => createSingular(d)).then((c) => results.push(c));
        })

        return lastPromise.then(() => results);
      })
  }

  private runner_addLabels(runner: DockerRunner, def: IContainerDefinition): Promise<DockerRunner> {
    if (def.hostRoute) {
      let rule = `Host: ${def.hostRoute}`;
      
      if (def.pathRoute) {
        rule = `${rule}; PathPrefixStrip: ${def.pathRoute}`;
      }

      runner.arg(`--label "traefik.frontend.rule=${rule}"`);
    }

    return Promise.resolve(runner);
  }

  private runner_addVolumes(runner: DockerRunner, def: IContainerDefinition): Promise<DockerRunner> {
    def.volumes = def.volumes || [];

    let lastPromise: Promise<any> = Promise.resolve();
    def.volumes.forEach((v) => {
      lastPromise = lastPromise.then(() => this.runner_addVolume(runner, v));
    });

    return lastPromise.then(() => runner);
  }

  private runner_addVolume(runner: DockerRunner, volumeEntry: IContainerDefinitionVolume): Promise<void> {
    let mgr = new VolumeManager(runner.environment);

    return mgr.getOrCreateVolume(volumeEntry.type)
      .then((vol) => {
        runner.arg(`--volume ${vol.Name}:${volumeEntry.mountPoint}`)
      })
  }

  private runner_addPorts(runner: DockerRunner, def: IContainerDefinition): Promise<DockerRunner> {
    def.ports = def.ports || [];

    def.ports.forEach((p) => { 
      runner.arg(`--publish ${p.hostPort}:${p.containerPort}`)
    });

    return Promise.resolve(runner);
  }

  private runner_addEnvironmentVariables(runner: DockerRunner, def: IContainerDefinition): Promise<DockerRunner> {
    def.env = def.env || {};
    for(let k in def.env) {
      if (def.env.hasOwnProperty(k)) {
        runner.arg(`--env "${k.toUpperCase()}=${def.env[k]}"`);
      }
    }

    return Promise.resolve(runner);
  }
}