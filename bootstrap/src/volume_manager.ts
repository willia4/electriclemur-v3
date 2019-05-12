import { DockerRunner } from './runner_docker';
import { IEnvironmentDefinition } from './manager.environment';

interface IVolume {
  Driver: string;
  Labels: { [k: string]: string };
  Mountpoint: string;
  Name: string;
  Options: any;
  Scope: string;
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

  public createVolume(label: string): Promise<IVolume> {
    return DockerRunner.MakeRunner(this.environment)
      .then((runner) => {
        runner.arg(`volume create`);

        if (label) {
          runner.arg(`--label ${label}`);
        }

        return runner.exec();  
      })
      .then((output: string) => {
        return this.inspectVolume(output)
      });
  }

  public getOrCreateVolume(volumeType: string): Promise<IVolume> {
    const label = `volumeRole=${volumeType}`;

    return this.getVolumes(label)
      .then((volumes) => {
        
        if (!volumes || !volumes.length) {
          return this.createVolume(label);
        }
        else {
          return volumes[0];
        }
      })
  }
}