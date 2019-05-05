#!/usr/bin/env node
import { DockerRunner } from './docker_runner';
import * as yargs from 'yargs';
import * as Path from 'path';
import * as def from './environment_definition';
import * as vol from './volume_manager';

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
    .argv;
  // return yargs
  //   .option('list', {
  //     default: false,
  //     type: 'boolean'
  //   });
}

function handleList(args: {environment: string}): Promise<void> {
  const secretsPath = Path.normalize(Path.join(__dirname, '../../secrets'))
  const environmentSecretsPath = Path.join(secretsPath, args.environment);
  const awsSecretsPath = Path.join(secretsPath, 'aws');

  let environmentDefinition: def.IEnvironmentDefinition = undefined;
  
  let databaseMount: string = undefined; 
  let sshKeyMount: string = undefined;
  let sshUserMount: string = undefined; 

  return def.getEnvironmentDefinition(args.environment)
    .then((definition) => {
      environmentDefinition = definition;
    })
    
    .then(() => vol.getOrCreateVolume('database'))
    .then((volume) => {
      databaseMount = volume.Mountpoint;
    })

    .then(() => vol.getOrCreateVolume('sshKeys'))
    .then((volume) => {
      sshKeyMount = volume.Mountpoint;
    })

    .then(() => vol.getOrCreateVolume('sshUser'))
    .then((volume) => {
      sshUserMount = volume.Mountpoint;
    })

    .then(() => {
      let output: IListOutput = {
        "lemur": {
          hosts: [ environmentDefinition.domainNames[0] ],
          vars: {
            "ansible_user": "root",
    
            "secretsPath": environmentSecretsPath,
    
            "aws_backup_access_key_path": `${Path.join(awsSecretsPath, 'backup_access_key.txt')}`,
            "aws_backup_access_secret_path": `${Path.join(awsSecretsPath, 'backup_access_secret.txt')}`,

            "database_path": databaseMount,
            "ssh_key_mount": sshKeyMount,
            "ssh_user_mount": sshUserMount
          },
          children: []
        }
      };

      console.log(JSON.stringify(output, null, 2));
    });
}

function handleHost(args: {environment: string, hostname: string}): Promise<void> {
  let output = {};

  console.log(JSON.stringify(output, null, 2));
  return Promise.resolve();
}

processArgs();
