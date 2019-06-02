import * as path from 'path';
import * as common from './common';
import * as ansible from './ansible_commands';

import { DockerRunner } from './runner_docker';
import { IEnvironmentDefinition } from './manager.environment';
import { access } from 'fs';

export interface IVolume {
  Driver: string;
  Labels: { [k: string]: string };
  Mountpoint: string;
  Name: string;
  Options: any;
  Scope: string;
}

export interface IVolumeSource {
  type: 's3' | 'local-secret'
}

export interface IVolumeS3Source extends IVolumeSource {
  type: 's3',
  s3Id: string
}

export interface IVolumeLocalSecretSource extends IVolumeSource {
  type: 'local-secret',
  files: string[]
}

export interface IVolumeDefinition {
  name: string;
  source?: IVolumeSource;
}

export interface IAWSAccessSecrets {
  accessKey: string;
  accessSecret: string;  
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

  public getVolume(volumeDefinition: IVolumeDefinition): Promise<IVolume> {
    const label = `volumeRole=${volumeDefinition.name}`;
    return this.getVolumes(label)
      .then((vols) => {
        if (!vols || !vols.length) { return undefined; }
        return vols[0];
      })
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
    return this.getVolume(volumeDefinition)
      .then((volume) => {
        if (volume === undefined) {
          return this.createVolume(volumeDefinition.name, `volumeRole=${volumeDefinition.name}`);
        }
        return Promise.resolve(volume);
      });
  }

  public getOrCreateVolumeForType(volumeType: string): Promise<IVolume> {
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

  public uploadDefaultSourceForVolumeDefinition(volumeDefinition: IVolumeDefinition, verbose: boolean = false): Promise<any> {
    return this.getOrCreateVolumeForDefinition(volumeDefinition)
      .then((volume) => {
        if (!volumeDefinition.source) { return Promise.resolve(); }

        switch(volumeDefinition.source.type) {
          case 's3': 
          return this._uploadVolumeFromS3(volume, volumeDefinition.source as IVolumeS3Source, verbose);

          case 'local-secret':
          return this._uploadVolumeFromLocalSecret(volume, volumeDefinition.source as IVolumeLocalSecretSource, verbose);

          default:
            return Promise.reject(`Unknown source: ${volumeDefinition.source.type}`);
        }
      })
  }

  public getAWSSecrets(): Promise<IAWSAccessSecrets> {
    let secretsPath = path.normalize(path.join(this.environment.secretPath, '../aws'));
    let accessKeyPath = path.join(secretsPath, 'backup_access_key.txt');
    let accessSecretPath = path.join(secretsPath, 'backup_access_secret.txt');

    return common.readFileAsync(accessKeyPath)
      .then((accessKey) => {
        return common.readFileAsync(accessSecretPath)
          .then((accessSecret) => {
            let r: IAWSAccessSecrets = {
              accessKey: accessKey,
              accessSecret: accessSecret
            };

            return r;
          })
      })
  }

  private _uploadVolumeFromS3(volume: IVolume, source: IVolumeS3Source, verbose: boolean = false): Promise<any> {
    console.log(`Uploading default data for ${volume.Name} from ${source.s3Id}`);

    return this.getAWSSecrets() 
      .then((awsSecrets) => {
        return DockerRunner.MakeRunner(this.environment)
          .then((runner) => {
            runner.echoOutput = verbose;
            return runner
              .arg('run')
              .arg('--rm')
              .arg(`-v ${volume.Name}:/v`)
              .arg(`-e AWS_ACCESS_KEY_ID=${awsSecrets.accessKey}`)
              .arg(`-e AWS_SECRET_ACCESS_KEY=${awsSecrets.accessSecret}`)
              .arg('willia4/aws_cli')
              .arg(`aws s3 sync --delete s3://${source.s3Id} /v`)
              .exec()
              .then((output) => { })
          })
      });    
  }

  private _uploadVolumeFromLocalSecret(volume: IVolume, source: IVolumeLocalSecretSource, verbose: boolean = false): Promise<any> {
    const secretPath = this.environment.secretPath;
    let secretFiles = source.files.map(f => path.join(secretPath, f));

    return ansible.uploadFiles(this.environment, secretFiles, volume.Mountpoint, verbose);
  }
}