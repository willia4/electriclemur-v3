#!/usr/bin/env node
import * as yargs from 'yargs';
import * as Path from 'path';
import { EnvironmentManager, IEnvironmentDefinition } from './manager.environment';
import { DropletManager } from './manager.droplet';

import { VolumeManager, IVolume } from './volume_manager';

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
  id: string,
  mountPath: string
}

interface IKnownVolumesDefinition {
  database: IVolumeDefinition;
  database_backup: IVolumeDefinition;
  
  ssh_key: IVolumeDefinition;
  ssh_user: IVolumeDefinition;

  branheatherby_com: IVolumeDefinition;
  mydwynter_com: IVolumeDefinition;
  mydwynterstudios_com: IVolumeDefinition;
  mydwyntertea_com: IVolumeDefinition;
  crowglassdesign_com: IVolumeDefinition;
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

function getVolumes(environment: IEnvironmentDefinition, skipVolumes: boolean): Promise<IKnownVolumesDefinition> {
  let r: IKnownVolumesDefinition = {
    database: undefined,
    database_backup: undefined,
    ssh_key: undefined,
    ssh_user: undefined,
    branheatherby_com: undefined,
    mydwynter_com: undefined,
    mydwynterstudios_com: undefined,
    mydwyntertea_com: undefined,
    crowglassdesign_com: undefined
  };

  let volumeToDefinition = (vol: IVolume) => {
    let r: IVolumeDefinition = {
      id: vol.Name,
      mountPath: vol.Mountpoint
    }

    return r;
  };
  
  if (skipVolumes) { return Promise.resolve(r); }

  let vol = new VolumeManager(environment);

  return Promise.resolve()
    .then(() => vol.getOrCreateVolume('database'))
    .then((volume) => {
      r.database = volumeToDefinition(volume);
    })

    .then(() => vol.getOrCreateVolume('database_backup'))
    .then((volume) => {
      r.database_backup = volumeToDefinition(volume);
    })

    .then(() => vol.getOrCreateVolume('ssh_key'))
    .then((volume) => {
      r.ssh_key = volumeToDefinition(volume);
    })

    .then(() => vol.getOrCreateVolume('ssh_user'))
    .then((volume) => {
      r.ssh_user = volumeToDefinition(volume);
    })

    .then(() => vol.getOrCreateVolume('branheatherby_com'))
    .then((volume) => {
      r.branheatherby_com = volumeToDefinition(volume);
    })

    .then(() => vol.getOrCreateVolume('mydwynter_com'))
    .then((volume) => {
      r.mydwynter_com = volumeToDefinition(volume);
    })

    .then(() => vol.getOrCreateVolume('mydwynterstudios_com'))
    .then((volume) => {
      r.mydwynterstudios_com = volumeToDefinition(volume);
    })
    
    .then(() => vol.getOrCreateVolume('mydwyntertea_com'))
    .then((volume) => {
      r.mydwyntertea_com = volumeToDefinition(volume);
    })

    .then(() => vol.getOrCreateVolume('crowglassdesign_com'))
    .then((volume) => {
      r.crowglassdesign_com = volumeToDefinition(volume);
    })


    .then(() => r);
}

function handleList(args: {environment: string, noVolumes: boolean}): Promise<void> {
  const secretsPath = Path.normalize(Path.join(__dirname, '../../secrets'))
  const environmentSecretsPath = Path.join(secretsPath, args.environment);
  const awsSecretsPath = Path.join(secretsPath, 'aws');

  let environmentDefinition: IEnvironmentDefinition = undefined;
  
  let volumeDefinition: IKnownVolumesDefinition = undefined;

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
            let volumeDef = volumeDefinition[p] as IVolumeDefinition;

            output["lemur"].vars[`vol_${p}_id`] = volumeDef.id;
            output["lemur"].vars[`vol_${p}_mount`] = volumeDef.mountPath;
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
