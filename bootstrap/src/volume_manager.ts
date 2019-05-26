import * as path from 'path';
import * as common from './common';
import { DockerRunner } from './runner_docker';
import { IEnvironmentDefinition } from './manager.environment';

export interface IVolume {
  Driver: string;
  Labels: { [k: string]: string };
  Mountpoint: string;
  Name: string;
  Options: any;
  Scope: string;
}

export interface IVolumeDefinition {
  name: string,
  owner?: string
}

export class VolumeManager {

  constructor(private environment: IEnvironmentDefinition) {}

  public inspectVolume(volumeName: string): Promise<IVolume> {
    if (!volumeName) { return Promise.resolve(undefined); }

    return this.inspectVolumes([volumeName])
      .then((volumes) => { 
        if (!volumes || !volumes.length) { return undefined; }
        return volumes[0];
      });
  }

  public inspectVolumes(volumeNames: string[]): Promise<IVolume[]> {
    if (!volumeNames) { return Promise.resolve([]); }
    volumeNames = volumeNames.filter(v => !!v);
    if (!volumeNames.length) { return Promise.resolve([]); }

    return DockerRunner.MakeRunner(this.environment)
      .then((runner) => {
        return runner
          .arg('volume inspect')
          .arg(volumeNames.join(' '))
          .exec();
      })
      .then((output) => JSON.parse(output) as IVolume[]);
  }

  public getVolumes(labelFilter: string = undefined): Promise<IVolume[]> {
    return DockerRunner.MakeRunner(this.environment)
      .then((runner) => {
        runner.arg('volume list');
        if (labelFilter) {
          runner.arg(`-f label=${labelFilter}`)
        }
        runner.arg('-q');

        return runner.exec();
      })
      .then((output) => output.split('\n').filter((l => !!l)))
      .then((volumeNames) => this.inspectVolumes(volumeNames));
  }

  public createVolume(name: string, label: string): Promise<IVolume> {
    let hashName = `${name}-${(new Date()).getTime()}`;

    return DockerRunner.MakeRunner(this.environment)
      .then((runner) => {
        runner.arg(`volume create`);

        if (label) {
          runner.arg(`--label ${label}`);
        }

        runner.arg(`${hashName}`);

        return runner.exec();  
      })
      .then((output: string) => {
        return this.inspectVolume(output)
      });
  }

  public getOrCreateVolumeForDefinition(volumeDefinition: IVolumeDefinition): Promise<IVolume> {
    return this.getOrCreateVolume(volumeDefinition.name)
      .then((volume) => this.setVolumePermissions(volume, volumeDefinition));
  }

  public getOrCreateVolume(volumeType: string): Promise<IVolume> {
    const label = `volumeRole=${volumeType}`;

    return this.getVolumes(label)
      .then((volumes) => {
        
        if (!volumes || !volumes.length) {
          return this.createVolume(volumeType, label);
        }
        else {
          return volumes[0];
        }
      })
  }

  public getVolumeDefinitions(): Promise<IVolumeDefinition[]> {
    const definitionPath = path.normalize(path.join(path.normalize(__dirname), `../../environments/volumes.json`))
  
    return common.readFileAsync(definitionPath)
      .then((contents) => (JSON.parse(contents) as IVolumeDefinition[]))
  }

  public setVolumePermissions(volume: IVolume, definition: IVolumeDefinition): Promise<IVolume> {
    if (!volume || !definition || !definition.owner) { return Promise.resolve(volume); }

    return DockerRunner.MakeRunner(this.environment)
      .then((runner) => {
        runner
          .arg("run")
          .arg("--rm")
          .arg(`--volume ${volume.Name}:/vol`)
          .arg("ubuntu")
          .arg("bash -c")
          .arg(`"chown ${definition.owner} /vol"`)
          .exec();
      })
      .then(() => volume);
  }
}