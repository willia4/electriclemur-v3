import { DockerRunner } from './docker_runner';
import * as yargs from 'yargs';

interface IVolume {
  Driver: string;
  Labels: { [k: string]: string };
  Mountpoint: string;
  Name: string;
  Options: any;
  Scope: string;
}

export function inspectVolume(volumeName: string): Promise<IVolume> {
  if (!volumeName) { return Promise.resolve(undefined); }

  return inspectVolumes([volumeName])
    .then((volumes) => { 
      if (!volumes || !volumes.length) { return undefined; }
      return volumes[0];
    });
}

export function inspectVolumes(volumeNames: string[]): Promise<IVolume[]> {
  if (!volumeNames) { return Promise.resolve([]); }
  volumeNames = volumeNames.filter(v => !!v);
  if (!volumeNames.length) { return Promise.resolve([]); }

  return DockerRunner.MakeRunner()
    .then((runner) => {
      return runner
        .arg('volume inspect')
        .arg(volumeNames.join(' '))
        .exec();
    })
    .then((output) => JSON.parse(output) as IVolume[]);
}

export function getVolumes(labelFilter: string = undefined): Promise<IVolume[]> {
  return DockerRunner.MakeRunner()
    .then((runner) => {
       runner.arg('volume list');
      if (labelFilter) {
        runner.arg(`-f label=${labelFilter}`)
      }
      runner.arg('-q');

       return runner.exec();
    })
    .then((output) => output.split('\n').filter((l => !!l)))
    .then((volumeNames) => inspectVolumes(volumeNames));
}

export function createVolume(label: string): Promise<IVolume> {
  return DockerRunner.MakeRunner()
    .then((runner) => {
      runner.arg(`volume create`);

      if (label) {
        runner.arg(`--label ${label}`);
      }

      return runner.exec();  
    })
    .then((output: string) => {
      return inspectVolume(output)
    });
}

export function getOrCreateVolume(volumeType: string): Promise<IVolume> {
  const label = `volumeRole=${volumeType}`;

  return getVolumes(label)
    .then((volumes) => {
      
      if (!volumes || !volumes.length) {
        return createVolume(label);
      }
      else {
        return volumes[0];
      }
    })
}