#!/usr/bin/env node
import * as yargs from 'yargs';
import * as path from 'path';
import * as common from './common';
import { EnvironmentManager, IEnvironmentDefinition } from './manager.environment';
import { DropletManager } from './manager.droplet';

import { VolumeManager, IVolume, IVolumeDefinition } from './volume_manager';

interface IListOutput {
  [g: string]: {
    hosts: string[],
    vars: {
      [s: string]: string|number|boolean
    },
    children: string[]
  }
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

    .command(`volume-ls <environment`, 'print volume information for an environment', (yargs) => {
      return yargs.positional('environment', {
        describe: 'environment that contains the volumes',
        type: 'string',
        required: true
      })
    }, handleVolumeList)
    .argv;
  // return yargs
  //   .option('list', {
  //     default: false,
  //     type: 'boolean'
  //   });
}



function getVolumes(environment: IEnvironmentDefinition, skipVolumes: boolean): Promise<{[key: string]: IVolume}> {
  let r: {[key: string]: IVolume} = {};

  // let volumeToDefinition = (vol: IVolume) => {
  //   let r: IVolumeDefinition = {
  //     name: vol.Name,
  //     mountPath: vol.Mountpoint
  //   }

  //   return r;
  // };
  
  if (skipVolumes) { return Promise.resolve(r); }

  let vol = new VolumeManager(environment);

  return vol.getVolumeDefinitions()
    .then((definitions) => {
      let lastPromise: Promise<any> = Promise.resolve(); 

      definitions.forEach((def) => {
        lastPromise = lastPromise
          .then(() => vol.getOrCreateVolumeForDefinition(def))
          .then((volume) => { r[def.name] = volume; })
      })

      return lastPromise;
    })
    .then(() => r)
}

function handleList(args: {environment: string, noVolumes: boolean}): Promise<void> {
  const secretsPath = path.normalize(path.join(__dirname, '../../secrets'))
  const environmentSecretsPath = path.join(secretsPath, args.environment);
  const awsSecretsPath = path.join(secretsPath, 'aws');

  let environmentDefinition: IEnvironmentDefinition = undefined;
  
  let volumeDefinition: {[key: string]: IVolume} = undefined;

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

            "aws_backup_access_key_path": `${path.join(awsSecretsPath, 'backup_access_key.txt')}`,
            "aws_backup_access_secret_path": `${path.join(awsSecretsPath, 'backup_access_secret.txt')}`
          },
          children: []
        }
      };

      if (!args.noVolumes) {
        for(let p in volumeDefinition) {
          if (volumeDefinition.hasOwnProperty(p)) {
            let volumeDef = volumeDefinition[p];

            output["lemur"].vars[`vol_${p}_id`] = volumeDef.Name;
            output["lemur"].vars[`vol_${p}_mount`] = volumeDef.Mountpoint;
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

function handleVolumeList(args: {environment: string}): Promise<void> {
  return EnvironmentManager.getEnvironmentDefinition(args.environment)
    .then((environment) => getVolumes(environment, false))
    .then((volumes) => {
      console.log(JSON.stringify(volumes, null, 2));
    })
    .then(() => { })
  
}

processArgs();
