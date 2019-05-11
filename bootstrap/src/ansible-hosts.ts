#!/usr/bin/env node
import * as yargs from 'yargs';
import * as Path from 'path';
import { EnvironmentManager, IEnvironmentDefinition } from './manager.environment';
import { DropletManager } from './manager.droplet';

import { VolumeManager } from './volume_manager';

interface IListOutput {
  [g: string]: {
    hosts: string[],
    vars: {
      [s: string]: string|number|boolean
    },
    children: string[]
  }
}

interface IVolumeDefinition {
  databaseMount: string;
  ssh_key_mount: string;
  ssh_user_mount: string;
  branheatherbycom_volume_id: string;
  mydwyntercom_volume_id: string;
  mydwynterstudioscom_volume_id: string;
  mydwynterteacom_volume_id: string;
  crowglassdesigncom_volume_id: string;
}

function processArgs() {
  return yargs
    .command('list', 'list hosts for ansible', (yargs) => {
      return yargs.option('environment', {
        describe: 'environment to list',
        type: 'string',
        required: true
      })
      .option('noVolumes', {
        describe: 'Skip docker volume variables (useful if you cannot log in to Docker yet)',
        type: 'boolean',
        required: false,
        default: false
      })
    }, handleList)
    
    .command('host <hostname>', 'print info for a hostname for ansible', (yargs) => {
      return yargs.positional('hostname', {
        describe: 'hostname to inspect',
        type: 'string',
        required: true
      })
      .option('environment', {
        describe: 'environment to list',
        type: 'string',
        required: true
      })
    }, handleHost)

    .command('ip <environment>', 'print ip address for an environment', (yargs) => {
      return yargs.positional('environment', {
        describe: 'environment that contains this host',
        type: 'string',
        required: true
      })
    }, handleIp)

    .command('fqdn <environment>', 'print fqdn for an environment', (yargs) => {
      return yargs.positional('environment', {
        describe: 'environment that contains this host',
        type: 'string',
        required: true
      })
    }, handleFQDN)
    .argv;
  // return yargs
  //   .option('list', {
  //     default: false,
  //     type: 'boolean'
  //   });
}

function getVolumes(environment: IEnvironmentDefinition, skipVolumes: boolean): Promise<IVolumeDefinition> {
  let r: IVolumeDefinition = {
    databaseMount: undefined,
    ssh_key_mount: undefined,
    ssh_user_mount: undefined,
    branheatherbycom_volume_id: undefined,
    mydwyntercom_volume_id: undefined,
    mydwynterstudioscom_volume_id: undefined,
    mydwynterteacom_volume_id: undefined,
    crowglassdesigncom_volume_id: undefined,
  };

  if (skipVolumes) { return Promise.resolve(r); }

  let vol = new VolumeManager(environment);

  return Promise.resolve()
    .then(() => vol.getOrCreateVolume('database'))
    .then((volume) => {
      r.databaseMount = volume.Mountpoint;
    })

    .then(() => vol.getOrCreateVolume('sshKeys'))
    .then((volume) => {
      r.ssh_key_mount = volume.Mountpoint;
    })

    .then(() => vol.getOrCreateVolume('sshUser'))
    .then((volume) => {
      r.ssh_user_mount = volume.Mountpoint;
    })

    .then(() => vol.getOrCreateVolume('branheatherbyCom'))
    .then((volume) => {
      r.branheatherbycom_volume_id = volume.Name;
    })

    .then(() => vol.getOrCreateVolume('mydwynterCom'))
    .then((volume) => {
      r.mydwyntercom_volume_id = volume.Name;
    })

    .then(() => vol.getOrCreateVolume('mydwynterstudiosCom'))
    .then((volume) => {
      r.mydwynterstudioscom_volume_id = volume.Name;
    })
    
    .then(() => vol.getOrCreateVolume('mydwynterteaCom'))
    .then((volume) => {
      r.mydwynterteacom_volume_id = volume.Name;
    })

    .then(() => vol.getOrCreateVolume('crowglassdesignCom'))
    .then((volume) => {
      r.crowglassdesigncom_volume_id = volume.Name;
    })


    .then(() => r);
}

function handleList(args: {environment: string, noVolumes: boolean}): Promise<void> {
  const secretsPath = Path.normalize(Path.join(__dirname, '../../secrets'))
  const environmentSecretsPath = Path.join(secretsPath, args.environment);
  const awsSecretsPath = Path.join(secretsPath, 'aws');

  let environmentDefinition: IEnvironmentDefinition = undefined;
  
  let volumeDefinition: IVolumeDefinition = undefined;

  return EnvironmentManager.getEnvironmentDefinition(args.environment)
    .then((definition) => {
      environmentDefinition = definition;
    })
    .then(() => getVolumes(environmentDefinition, args.noVolumes))
    .then((volumes) => { volumeDefinition = volumes; })

    .then(() => {
      let output: IListOutput = {
        "lemur": {
          hosts: [ environmentDefinition.fqdn ],
          vars: {
            "ansible_user": "root",
            "fqdn": environmentDefinition.fqdn,

            "secretsPath": environmentSecretsPath,

            "aws_backup_access_key_path": `${Path.join(awsSecretsPath, 'backup_access_key.txt')}`,
            "aws_backup_access_secret_path": `${Path.join(awsSecretsPath, 'backup_access_secret.txt')}`
          },
          children: []
        }
      };

      if (!args.noVolumes) {
        for(let p in volumeDefinition) {
          if (volumeDefinition.hasOwnProperty(p)) {
            output["lemur"].vars[p] = volumeDefinition[p];
          }
        }
      }
      
      console.log(JSON.stringify(output, null, 2));
    });
}

function handleHost(args: {environment: string, hostname: string}): Promise<void> {
  let output = {};

  console.log(JSON.stringify(output, null, 2));
  return Promise.resolve();
}

function handleIp(args: {environment: string}): Promise<void> {
  let dropletManager = new DropletManager();
  let environmentDefinition: IEnvironmentDefinition = undefined; 

  return EnvironmentManager.getEnvironmentDefinition(args.environment)
  .then((def) => {
    environmentDefinition = def;
    return dropletManager.getDroplet(def.dropletName);
  })
  .then((droplet) => {
    if (!droplet) {
      console.error(`Could not get droplet for ${environmentDefinition.dropletName}`);
      process.exit(1);
    }
    console.log(`${dropletManager.ipForDroplet(droplet)}`);
  })
}

function handleFQDN(args: {environment: string}): Promise<void> {
  return EnvironmentManager.getEnvironmentDefinition(args.environment)
  .then((definition) => {
    console.log(definition.domainNames[0]);
  })
}
processArgs();
