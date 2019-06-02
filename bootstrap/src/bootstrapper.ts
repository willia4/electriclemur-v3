#!/usr/bin/env node
import { DropletManager, IDroplet } from './manager.droplet';
import { DNSManager } from './manager.dns';

import * as yargs from 'yargs';
import * as fs from 'fs';
import * as path from 'path';

import * as inquirer from 'inquirer';
import { EnvironmentManager, IEnvironmentDefinition } from './manager.environment';
import * as common from './common';
import * as ansible from './ansible_commands';
import { AnsibleRunner } from './ansible_runner';
import { ScriptRunner } from './script_runner';
import { VolumeManager } from './volume_manager';
import { IContainerDefinition, ContainerManager } from './manager.container';
import { DatabaseManager } from './manager.database';

const yaml = require('yaml');

function getApiKey(): Promise<string> {
  const path = "/home/willia4/.config/doctl/config.yaml";
  var data = yaml.parse(fs.readFileSync(path, 'utf-8'));
  //return data['access-token'];

  return Promise.resolve(data['access-token']);
}

interface ICreateArgs {
  environmentName: string;
  skipDNS: boolean;
  skipInit: boolean;
  skipVolumes: boolean;
  skipDatabase: boolean;
  verbose: boolean;
}

interface IDeleteArgs {
  environmentName: string;
  verbose: boolean;
}

interface IUpdateDNSArgs {
  environmentName: string;
  verbose: boolean;
}
function processArgs() {
  return yargs
    .command('create <environmentName>', 'create an environment', (yargs) => {
      return yargs
        .positional('environmentName', {
          type: 'string',
          required: true,
          describe: 'environment to create'
        })
        .option('skipDNS', {
          type: 'boolean',
          default: false
        })
        .option('skipInit', {
          type: 'boolean',
          default: false
        })
        .option('skipVolumes', {
          type: 'boolean',
          default: false
        })
        .option('skipDatabase', {
          type: 'boolean',
          default: false
        })
        .option('verbose', {
          type: 'boolean',
          default: false
        })
    }, handleCreate)

    .command('delete <environmentName>', 'delete an environment', (yargs) => {
      return yargs
      .positional('environmentName', {
        type: 'string',
        required: true,
        describe: 'environment to delete'
      })
      .option('verbose', {
        type: 'boolean',
        default: false
      })
    }, handleDelete)

    .command('update-dns <environmentName>', 'update the DNS records for an environment', (yargs) => {
      return yargs
      .positional('environmentName', {
        type: 'string',
        required: true,
        describe: 'environment to update'
      })
      .option('verbose', {
        type: 'boolean',
        default: false
      })
    }, handleDnsUpdate)
  .argv;
}


function createDroplet(dropletManager: DropletManager, environment: IEnvironmentDefinition): Promise<IDroplet> {
  console.info(`Checking if ${environment.dropletName} already exists`);
  
  return dropletManager.getDroplet(environment.dropletName)
    .then((d) => {
      if (d !== undefined) {
        return inquirer.prompt([
          {
            type: 'confirm',
            name: 'continue',
            message: `Droplet ${d.name} already exists and will not be created. Continue anyway?`,
            default: false
          }
        ])
        .then((answers) => {
          if (!answers['continue']) {
            process.exit(1);
          }

          return d;
        });
      }

      console.info(`Droplet ${environment.dropletName} will be created`);
      return dropletManager.createDroplet(environment.dropletName);
    })
    .then((droplet) => {
      console.log(`Name: ${droplet.name}`);
      console.log(`Id: ${droplet.id}`);

      console.log(`IP: ${dropletManager.ipForDroplet(droplet)}`);

      return droplet;
    });
}

function createDockerCerts(environment: IEnvironmentDefinition, verbose: boolean): Promise<any> {
  console.log(`Creating docker certs`)
  return ScriptRunner.MakeRunner()
    .then((runner) => {
      runner.echoOutput = verbose;

      let scriptPath = path.normalize(path.join(path.normalize(__dirname), '../make-docker-certs.sh'))
      return runner.exec(`${scriptPath} ${environment.environmentName}`);
    })
    .then(() => console.log(`Done creating docker certs`));
}

function initDockerOnHost(environment: IEnvironmentDefinition, verbose: boolean): Promise<any> {
  const hostCertsDirectory = '/etc/docker_certs';

  return createDockerCerts(environment, verbose)
    .then(() => ansible.createDirectory(environment, hostCertsDirectory, verbose))
    .then(() => {
      let files = [
        `${environment.secretPath}/docker_certs/ca.pem`,
        `${environment.secretPath}/docker_certs/${environment.fqdn}/server-cert.pem`,
        `${environment.secretPath}/docker_certs/${environment.fqdn}/server-key.pem`
      ];

      return ansible.uploadFiles(environment, files, hostCertsDirectory, verbose)
    })
    .then(() => ansible.removeLineFromFile(
      environment,
      '/etc/sysconfig/docker',
      '^OPTIONS',
      verbose
    ))
    .then(() => ansible.addLineToFile(
      environment,
      '/etc/sysconfig/docker',
      '\"OPTIONS=\'--selinux-enabled --log-driver=journald --tlsverify --tlscacert=/etc/docker_certs/ca.pem --tlscert=/etc/docker_certs/server-cert.pem --tlskey=/etc/docker_certs/server-key.pem -H=0.0.0.0:2376 -H=unix:///var/run/docker.sock\'\"',
      verbose
    ))
    .then(() => ansible.runCommand(environment, 'systemctl daemon-reload', verbose))
    .then(() => ansible.runCommand(environment, 'systemctl restart docker.service', verbose));
}

function createDNS(dropletManager: DropletManager, dnsManager: DNSManager, environment: IEnvironmentDefinition, droplet: IDroplet, verbose: boolean = false): Promise<IDroplet> {
  let firstPromise = Promise.resolve();
  let lastPromise: Promise<any> = firstPromise;

  let dropletIp = dropletManager.ipForDroplet(droplet);
  environment.domainNames.forEach(d => {
    lastPromise = lastPromise.then(() => {
      return dnsManager.createOrUpdateDNSARecord(d, dropletIp)
        .then((dns) => {
          console.log(`Created DNS record for ${d}`);
          if (verbose) { console.log(dns); }
          
        });
    });
  });

  return lastPromise.then(() => droplet);
}

function uploadVolumeDefaults(environment: IEnvironmentDefinition, verbose: boolean = false): Promise<void> {
  let volumeManager = new VolumeManager(environment)
  return volumeManager.getVolumeDefinitions()
    .then(volumeDefs => {
      let lastPromise: Promise<any> = Promise.resolve();
      volumeDefs.forEach(v => { 
        lastPromise = lastPromise.then(() => volumeManager.uploadDefaultSourceForVolumeDefinition(v, verbose));
      });

      return lastPromise.then(() => {});
    })
}

function protectSSHKeys(environment: IEnvironmentDefinition, verbose: boolean): Promise<void> {
  let volumeManager = new VolumeManager(environment);
  return volumeManager.getOrCreateVolumeForType('ssh_key', verbose)
    .then((vol) => {
      if (!vol) { return Promise.resolve(); }
      return ansible.listFiles(environment, vol.Mountpoint, "*", false, verbose)
        .then((files) => {
          let lastPromise: Promise<any> = Promise.resolve();

          files.forEach(f => {
            lastPromise = lastPromise
              .then(() => ansible.setFileMode(environment, f, "0600", verbose));
          });

          return lastPromise.then(() => {});
        })
    })
}

function handleCreate(args: ICreateArgs): Promise<any> {
  let definition: IEnvironmentDefinition = undefined;

  let dropletManager = new DropletManager();
  let dnsManager = new DNSManager();

  dropletManager.verbose = args.verbose;
  dnsManager.verbose = args.verbose;

  return EnvironmentManager.getEnvironmentDefinition(args.environmentName)
    .catch((err: Error) => {
      console.error(`Could not read definition file: `, err.message);
      process.exit(1);
      return definition;
    })
    .then((d) => { definition = d; })
    .then(() => createDroplet(dropletManager, definition))
    .then((droplet) => {
      if (!args.skipDNS) { 
        return createDNS(dropletManager, dnsManager, definition, droplet, args.verbose)
          // DNS is required for everything else so only do the rest after doing createDNS
          .then(() => {
            if (!args.skipInit) { return initDockerOnHost(definition, args.verbose); }
            return Promise.resolve();            
          })
          .then(() => {
            if (!args.skipVolumes) { 
              console.log('Uploading volume data')
              return uploadVolumeDefaults(definition, args.verbose)
                .then(() => protectSSHKeys(definition, args.verbose)) 
            }
            return Promise.resolve();
          })
          .then(() => {
            if (!args.skipDatabase) {
              let databaseManager = new DatabaseManager(definition, args.verbose);
              return databaseManager.getOrCreateDatabaseContainer()
                .then(() => {
                  console.log("Waiting for database containers to finish deploying");
                  return common.delay(1200);
                })
                .then(() => databaseManager.restoreDatabases())
                .then(() => {});
            }
            return Promise.resolve();
          });
      }

      return Promise.resolve(undefined);
    })    
    .catch((err) => {
      console.error(`Error:`)
      console.error(err);
      process.exit(1);
    });
}

function handleDelete(args: IDeleteArgs): Promise<any> {
  let deleteActions: (() => Promise<any>)[] = [];
  let definition: IEnvironmentDefinition = undefined;

  let dropletManager = new DropletManager();
  let dnsManager = new DNSManager();

  dropletManager.verbose = args.verbose;
  dnsManager.verbose = args.verbose;

  return EnvironmentManager.getEnvironmentDefinition(args.environmentName)
    .catch((err: Error) => {
      console.error(`Could not read definition file: `, err.message);
      process.exit(1);
      return definition;
    })
    .then((d) => { definition = d; })
    .then(() => dropletManager.getDroplet(definition.dropletName))
    .then((droplet) => { 
      if (droplet !== undefined) {
        console.log(`Will delete droplet ${droplet.name} (${droplet.id})`);
        deleteActions.push((() => dropletManager.deleteDroplet(droplet)));
      }
    })
    .then(() => {
      let firstPromise = Promise.resolve();
      let lastPromise: Promise<any> = firstPromise;

      definition.domainNames.forEach((fqdn) => {
        lastPromise = lastPromise.then(() => {
          return dnsManager.getDNSRecord(fqdn)
            .then((record) => {
              if (record !== undefined) {
                console.log(`Will delete DNS record ${fqdn} ${record.id}`)
                deleteActions.push((() => dnsManager.deleteDnsRecord(record)));
              }
            })
        })
      });

      return lastPromise;
    })
    .then(() => {
      if (!deleteActions.length) {
        console.log('Nothing to delete')
        process.exit(5);
      }
    })
    .then(() => {
      return inquirer.prompt([
        {
          type: 'confirm',
          name: 'continue',
          message: `Perform above actions?`,
          default: false
        }
      ])
      .then((answers) => {
        if (!answers['continue']) {
          process.exit(1);
        }
      });
    })
    .then(() => {
      let lastPromise: Promise<any> = Promise.resolve();
      deleteActions.forEach(a => {
        lastPromise = lastPromise.then(() => a());
      });
      return lastPromise;
    })
}

function handleDnsUpdate(args: IUpdateDNSArgs): Promise<any> {
  let environmentDefinition: IEnvironmentDefinition = undefined;
  let dropletManager = new DropletManager();
  let dnsManager = new DNSManager();

  dropletManager.verbose = args.verbose;
  dnsManager.verbose = args.verbose;
  
  return EnvironmentManager.getEnvironmentDefinition(args.environmentName)
    .then((env) => {environmentDefinition = env; })
    .then(() => dropletManager.getDroplet(environmentDefinition.dropletName))
    .then((d) => { if (!d) { throw new Error(`Could not load droplet ${environmentDefinition.dropletName}`); } return d; })
    .then((d) => createDNS(dropletManager, dnsManager, environmentDefinition, d))
}

processArgs();
