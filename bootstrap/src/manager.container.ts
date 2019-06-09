import { DockerRunner } from "./runner_docker";
import { IEnvironmentDefinition } from "./manager.environment";
import * as common from './common';
import * as path from 'path';
import { VolumeManager } from "./volume_manager";
import { SecretManager } from "./manager.secrets";

export interface IContainerDefinitionVolume {
  type: string;
  mountPoint: string;
}

export interface IContainerDefinitionPort {
  containerPort: number;
  hostPort: number;
}

export interface IDatabaseSecret {
  database: string,
  secretType: "username" | "password"
}

export interface ISecretEnvar {
  secretName: string
}

export type envarT = string | ISecretEnvar | IDatabaseSecret;

export interface IContainerDefinition {
  name: string;
  image: string;

  hostRoute?: string;
  pathRoute?: string;

  volumes?: IContainerDefinitionVolume[];
  ports?: IContainerDefinitionPort[];
  env?: { [key: string]: envarT };
  links?: string[];

  sftp?: {
    hostPort: number;
    volumeType: string;
  }
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
  static getContainerDefinitions(containerName: string, verbose: boolean): Promise<IContainerDefinition[]> {
    console.log(`Loading container definition for ${containerName}`);

    if (containerName === ContainerManager.TraefikProxyName) {
      let def: IContainerDefinition = {
        name: ContainerManager.TraefikProxyName,
        image: undefined
      }
      return Promise.resolve([def]);
    }
    else {
      const definitionPath = path.normalize(path.join(path.normalize(__dirname), `../../containers/${containerName}.json`))
      return common.readFileAsync(definitionPath)
        .then((contents) => {
          let data = JSON.parse(contents);
          let containerDefs: IContainerDefinition[] = [];
          if (Array.isArray(data)) {
            containerDefs = data as IContainerDefinition[];
          }
          else {
            containerDefs = [data as IContainerDefinition];
          }

          if (verbose) {
            console.log(`${definitionPath} contained ${containerDefs.length} definitions`);
          }

          let sftpContainers = containerDefs.map(d => this.makeSFTPContainerDefinition(d, verbose)).filter(d => !!d);

          if (verbose) {
            console.log(`${containerName} definition wants SFTP container: ${ !!sftpContainers.length }`)
          }

          return containerDefs.concat(sftpContainers);
        });
    }
  }

  static getAvailableContainerDefinitions(verbose: boolean): Promise<string[]> {
    const definitionsPath = path.normalize(path.join(path.normalize(__dirname), `../../containers/`))

    console.log(`Reading all available containers from ${definitionsPath}`);

    return common.listFilesAsync(definitionsPath)
      .then((files) => files.map(f => f.replace(/\.json$/, '')))
      .then((names) => {
        if (verbose) {
          console.log('Found: ')
          names.forEach(n => { console.log(`  ${n}`); });
        }

        return names;
      })
  }

  static makeSFTPContainerDefinition(webDefinition: IContainerDefinition, verbose: boolean): IContainerDefinition {
    if (!webDefinition.sftp) { return undefined; }

    let r: IContainerDefinition = {
      name: `${webDefinition.name}-sftp`,
      image: "willia4/sftp_volume:1.4.0",
      volumes: [
          { type: "ssh_key", mountPoint: "/volumes/ssh_keys" },
          { type: "ssh_user", mountPoint: "/volumes/user" },
          { type: webDefinition.sftp.volumeType, mountPoint: "/volumes/sftp_root/www" }
      ],
      ports: [
        { containerPort: 22, hostPort: webDefinition.sftp.hostPort }
      ],
      env: {
        SFTP_CONTAINER_GROUP: "root",
        SFTP_CONTAINER_GROUP_ID: "0",
        SFTP_CONTAINER_USER: "root",
        SFTP_CONTAINER_USER_ID: "0"
      }
    }

    if (verbose) {
      console.log(`Created SFTP definition for ${webDefinition.name}`);
      console.log(r);
    }

    return r;
  }

  static get TraefikProxyName(): string { return 'traefik_proxy'};

  constructor() { }

  public getContainer(environment: IEnvironmentDefinition, name: string, verbose: boolean): Promise<IContainer> {
    console.log(`Getting container ${name} from ${environment.fqdn}`);

    return DockerRunner.MakeRunner(environment)
      .then((runner) => {
        runner.echoOutput = verbose;

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
          })
          .then((c) => {
            if (verbose) { 
              console.log('Got container from docker:')
              console.log(c);
            }

            return c;
          });
      });
  }

  public containerExists(environment: IEnvironmentDefinition, name: string, verbose: boolean): Promise<boolean> {
    console.log(`Determining if container ${name} exists in ${environment.fqdn}`);

    return this.getContainer(environment, name, verbose)
      .then((container) => container !== undefined)
      .then((exists) => {
        console.log(`Container exists: ${exists}`);
        return exists;
      })
  }

  public createTraefik(environment: IEnvironmentDefinition, verbose: boolean): Promise<IContainer[]> {
    console.log('Creating Traefik container');

    return this.getContainer(environment, ContainerManager.TraefikProxyName, verbose)
      .then((container) => {
        if (container) { 
          console.log('Traefik container already exists; doing nothing')
          return Promise.resolve(container); 
        }

        return DockerRunner.MakeRunner(environment)
          .then((runner) => {
            return runner
              .arg('run')
              .arg('-d')
              .arg('--restart always')
              .arg('-p 8080:8080')
              .arg('-p 80:80')
              .arg('-v /var/run/docker.sock:/var/run/docker.sock')
              .arg(`--name ${ContainerManager.TraefikProxyName}`)
              .arg('traefik')
              .arg('--api --docker')
              .exec()
              .then((id) => this.getContainer(environment, id, verbose));
          })
      })
      .then((c) => {
        console.log('Created Traefik container')
        if (verbose) { 
          console.log(c);  
        }

        return c;
      })
      .then((c) => [c]);
  }
  
  public deleteContainer(environment: IEnvironmentDefinition, containerDefinition: string | IContainerDefinition[] | IContainerDefinition, verbose: boolean): Promise<void> {
    let definitionsPromise: Promise<IContainerDefinition[]> = undefined; 

    if (!containerDefinition) {
      return Promise.resolve();
    }

    if (typeof(containerDefinition) === 'string') {
      console.log(`Deleting container ${containerDefinition}`)
      definitionsPromise = ContainerManager.getContainerDefinitions(containerDefinition, verbose);
    }
    else if (Array.isArray(containerDefinition)) {
      (containerDefinition as IContainerDefinition[]).forEach(c => { console.log(`Deleting container ${c.name}`)});
      definitionsPromise = Promise.resolve(containerDefinition as IContainerDefinition[])
    }
    else {
      console.log(`Deleting container ${(containerDefinition as IContainerDefinition).name}`);
      definitionsPromise = Promise.resolve([containerDefinition as IContainerDefinition]);
    }

    var deleteSingularContainer = (def: IContainerDefinition) => {
      return this.getContainer(environment, def.name, verbose)
        .then((container) => {
          if (!container) { 
            console.log(`Container does not exist; doing nothing`)
            return Promise.resolve(); 
          }

          return DockerRunner.MakeRunner(environment)
          .then((runner) => {
            runner.echoOutput = verbose;

            return runner
            .arg('rm --force')
            .arg(`${container.Id}`)
            .exec()
            .then(() => {
              console.log(`Container ${container.Name} deleted`);
            });
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

  public createContainerFromDefinition_noSFTP(environment: IEnvironmentDefinition, def: IContainerDefinition, verbose: boolean): Promise<IContainer> {
    console.log(`Creating ${def.name} container from a definition (not automatically expanding SFTP for this container)`);

    return DockerRunner.MakeRunner(environment)
      // Add basics to command line
      .then((runner) => {
        runner.echoOutput = verbose;
        return runner
          .arg('run')
          .arg('-d')
          .arg('--restart always')
          .arg(`--name ${def.name}`)
      })

      .then((runner) => this.runner_addLabels(runner, environment, def, verbose))
      .then((runner) => this.runner_addVolumes(runner, def, verbose))
      .then((runner) => this.runner_addPorts(runner, def, verbose))
      .then((runner) => this.runner_addLinks(runner, def, verbose))
      .then((runner) => this.runner_addEnvironmentVariables(runner, def, verbose))
      
      // Add image at end of command line
      .then((runner) => { 
        return runner.arg(def.image)
      })

      .then((runner) => { runner.outputCommand(); return runner; })
      .then((runner) => runner.exec())
      .then((id) => this.getContainer(environment, id, verbose))
      .then((c) => {
        console.log(`Created ${c.Name} (${c.Id})`);

        return c;
      })
  }

  public createGeneric(environment: IEnvironmentDefinition, containerName: string, verbose: boolean): Promise<IContainer[]> {
    console.log(`Creating generic container ${containerName}`);

    return ContainerManager.getContainerDefinitions(containerName, verbose)
      .then((defs) => {
        let results: IContainer[] = [];

        let lastPromise: Promise<any> = Promise.resolve();
        defs.forEach(d => {
          console.log(`Creating container ${d.name}`);
          lastPromise = lastPromise.then(() => this.createContainerFromDefinition_noSFTP(environment, d, verbose)).then((c) => results.push(c));
        })

        return lastPromise.then(() => results);
      })
  }

  private runner_addLabels(runner: DockerRunner, environment: IEnvironmentDefinition, def: IContainerDefinition, verbose: boolean): Promise<DockerRunner> {
    if (def.hostRoute) {
      let hostRule = def.hostRoute;
      if (environment.urlMap.hasOwnProperty(hostRule)) {
        hostRule = environment.urlMap[hostRule];
      }

      let rule = `Host: ${hostRule}`;
      
      if (def.pathRoute) {
        rule = `${rule}; PathPrefixStrip: ${def.pathRoute}`;
      }

      if (verbose) { console.log( `Adding "traefik.frontend.rule=${rule}" label`); }
      runner.arg(`--label "traefik.frontend.rule=${rule}"`);
    }

    return Promise.resolve(runner);
  }

  private runner_addVolumes(runner: DockerRunner, def: IContainerDefinition, verbose: boolean): Promise<DockerRunner> {
    def.volumes = def.volumes || [];

    let lastPromise: Promise<any> = Promise.resolve();
    def.volumes.forEach((v) => {
      lastPromise = lastPromise.then(() => this.runner_addVolume(runner, v, verbose));
    });

    return lastPromise.then(() => runner);
  }

  private runner_addVolume(runner: DockerRunner, volumeEntry: IContainerDefinitionVolume, verbose: boolean): Promise<void> {
    let mgr = new VolumeManager(runner.environment);

    return mgr.getOrCreateVolumeForType(volumeEntry.type, verbose)
      .then((vol) => {
        if (verbose) { console.log(`Adding ${vol.Name}:${volumeEntry.mountPoint} volume`); }
        runner.arg(`--volume ${vol.Name}:${volumeEntry.mountPoint}`)
      })
  }

  private runner_addPorts(runner: DockerRunner, def: IContainerDefinition, verbose: boolean): Promise<DockerRunner> {
    def.ports = def.ports || [];

    def.ports.forEach((p) => { 
      if (verbose) { console.log(`Adding ${p.hostPort}:${p.containerPort} port`); }
      runner.arg(`--publish ${p.hostPort}:${p.containerPort}`)
    });

    return Promise.resolve(runner);
  }

  private runner_addLinks(runner: DockerRunner, def: IContainerDefinition, verbose: boolean): Promise<DockerRunner> {
    def.links = def.links || [];

    def.links.forEach((l) => {
      if (verbose) { console.log(`Adding container link to ${l}`); }
      runner.arg(`--link ${l}`);
    });

    return Promise.resolve(runner);
  }

  private runner_addEnvironmentVariables(runner: DockerRunner, def: IContainerDefinition, verbose: boolean): Promise<DockerRunner> {
    let secretManager = new SecretManager(runner.environment, verbose);

    let envarValue: ((e: envarT) => Promise<string>) = (e: envarT) => {
      if (typeof(e) === 'string') { 
        return Promise.resolve(e as string); 
      }
      else if (e.hasOwnProperty('secretName')) {
        return secretManager.readEnvironmentSecret((e as ISecretEnvar).secretName);
      }
      else if (e.hasOwnProperty('database')) {
        return secretManager.readDatabaseSecret((e as IDatabaseSecret).database)
          .then((s) => s[(e as IDatabaseSecret).secretType]);
      }
      else {
        return Promise.reject(`Could not determine environment variable type for ${e}`);
      }
    }

    let lastPromise: Promise<any> = Promise.resolve();

    def.env = def.env || {};
    for(let k in def.env) {
      if (def.env.hasOwnProperty(k)) {
        lastPromise = lastPromise
          .then(() => envarValue(def.env[k]))
          .then((envar) => {
            if(verbose) { console.log(`Setting environment variable for ${k.toUpperCase()}`); }
            runner.arg(`--env "${k.toUpperCase()}=${envar}"`);
          });
      }
    }

    return lastPromise.then(() => runner);
  }

}