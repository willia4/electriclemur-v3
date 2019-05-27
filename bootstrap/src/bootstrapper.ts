#!/usr/bin/env node
import { DropletManager, IDroplet } from './manager.droplet';
import { DNSManager } from './manager.dns';

import * as yargs from 'yargs';
import * as fs from 'fs';
import * as path from 'path';

import * as inquirer from 'inquirer';
import { EnvironmentManager, IEnvironmentDefinition } from './manager.environment';
import { AnsibleRunner } from './ansible_runner';
import { ScriptRunner } from './script_runner';

const yaml = require('yaml');

function getApiKey(): Promise<string> {
  const path = "/home/willia4/.config/doctl/config.yaml";
  var data = yaml.parse(fs.readFileSync(path, 'utf-8'));
  //return data['access-token'];

  return Promise.resolve(data['access-token']);
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
    }, handleCreate)

    .command('delete <environmentName>', 'delete an environment', (yargs) => {
      return yargs
      .positional('environmentName', {
        type: 'string',
        required: true,
        describe: 'environment to delete'
      })
    }, handleDelete)

    .command('update-dns <environmentName>', 'update the DNS records for an environment', (yargs) => {
      return yargs
      .positional('environmentName', {
        type: 'string',
        required: true,
        describe: 'environment to update'
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

function createDockerCerts(environment: IEnvironmentDefinition): Promise<any> {
  return ScriptRunner.MakeRunner()
    .then((runner) => {
      let scriptPath = path.normalize(path.join(path.normalize(__dirname), '../make-docker-certs.sh'))
      return runner.exec(`${scriptPath} ${environment.environmentName}`, true);
    })
}

function createDNS(dropletManager: DropletManager, dnsManager: DNSManager, environment: IEnvironmentDefinition, droplet: IDroplet): Promise<IDroplet> {
  let firstPromise = Promise.resolve();
  let lastPromise: Promise<any> = firstPromise;

  let dropletIp = dropletManager.ipForDroplet(droplet);
  environment.domainNames.forEach(d => {
    lastPromise = lastPromise.then(() => {
      return dnsManager.createOrUpdateDNSARecord(d, dropletIp)
        .then((dns) => {
          console.log(`Created DNS record for ${d}`);
          console.log(dns);
        });
    });
  });

  return lastPromise.then(() => droplet);
}

function handleCreate(args: {environmentName: string}): Promise<any> {

  let definition: IEnvironmentDefinition = undefined;

  let dropletManager = new DropletManager();
  let dnsManager = new DNSManager();

  return EnvironmentManager.getEnvironmentDefinition(args.environmentName)
    .catch((err: Error) => {
      console.error(`Could not read definition file: `, err.message);
      process.exit(1);
      return definition;
    })
    .then((d) => { definition = d; })
    .then(() => createDroplet(dropletManager, definition))
    .then((droplet) => createDNS(dropletManager, dnsManager, definition, droplet))
    .then(() => createDockerCerts(definition))
    .then(() => AnsibleRunner.RunPlaybook(definition, "init-host"))
    .then(() => AnsibleRunner.RunPlaybook(definition, "upload-files"))
    .catch((err) => {
      console.error(`Error:`)
      console.error(err);
      process.exit(1);
    });
}

function handleDelete(args: {environmentName: string}): Promise<any> {
  let deleteActions: (() => Promise<any>)[] = [];
  let definition: IEnvironmentDefinition = undefined;

  let dropletManager = new DropletManager();
  let dnsManager = new DNSManager();

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

function handleDnsUpdate(args: {environmentName: string}): Promise<any> {
  let environmentDefinition: IEnvironmentDefinition = undefined;
  let dropletManager = new DropletManager();
  let dnsManager = new DNSManager();

  return EnvironmentManager.getEnvironmentDefinition(args.environmentName)
    .then((env) => {environmentDefinition = env; })
    .then(() => dropletManager.getDroplet(environmentDefinition.dropletName))
    .then((d) => { if (!d) { throw new Error(`Could not load droplet ${environmentDefinition.dropletName}`); } return d; })
    .then((d) => createDNS(dropletManager, dnsManager, environmentDefinition, d))
}

processArgs();
