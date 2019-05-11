#!/usr/bin/env node
import {DropletManager, IDroplet } from './manager.droplet';

import { DORunner } from './do_runner';
import * as yargs from 'yargs';
import * as fs from 'fs';

import * as _parseDomain from 'parse-domain';
import * as inquirer from 'inquirer';
import * as def from './environment_definition';

const yaml = require('yaml');



interface ParsedDomain {
  subdomain: string,
  domain: string,
  tld: string,
  zone: string
}

interface DNSRecord {
  id: number,
  type: string,
  name: string,
  data: string,
  ttl: number,
  zone: string
}

let cached_dns_records: Map<string, DNSRecord[]> = new Map<string, DNSRecord[]>();

function getApiKey(): Promise<string> {
  const path = "/home/willia4/.config/doctl/config.yaml";
  var data = yaml.parse(fs.readFileSync(path, 'utf-8'));
  //return data['access-token'];

  return Promise.resolve(data['access-token']);
}

function parseDomain(domain: string): ParsedDomain {
  let p = _parseDomain(domain);
  p.zone = `${p.domain}.${p.tld}`;
  return p as ParsedDomain;
}











function getDNSRecordsInZone(zone: string): Promise<DNSRecord[]> {
  return Promise.resolve()
    .then(() => {
      if ( cached_dns_records.has(zone) ) { return Promise.resolve(); }
      return DORunner.MakeRunner()
        .then((runner) => {
          return runner
              .arg(`compute domain records list ${zone}`)
              .arg('-o json')
              .exec();
        })
        .then((output) => { 

          let records = JSON.parse(output) as DNSRecord[];
          records.forEach(r => { r.zone = zone; })
          cached_dns_records.set(zone, records);
        })
    })
    .then(() => cached_dns_records.get(zone));
}

function getDNSRecord(fqdn: string): Promise<DNSRecord> {
  let parsed = parseDomain(fqdn);
  return getDNSRecordsInZone(parsed.zone)
    .then((records) => {
      let found: DNSRecord[] = [];
      if (!parsed.subdomain) {
        found = records.filter(r => r.name === '@' && r.type === 'A');
      }
      else {
        found = records.filter(r => r.name === parsed.subdomain && r.type === 'A');
      } 

      if (found.length <= 0) { return undefined; }
      return found[0];     
    });
}

function createOrUpdateDNSARecord(fqdn: string, ipAddress: string): Promise<DNSRecord> {
  const parsed = parseDomain(fqdn);

  function _createDNSARecord(zone: string, recordName: string, ipAddress: string): Promise<DNSRecord> {
    if (!recordName) { throw `Cannot create new A record for ${zone} zone. Create this in the portal.`}

    return DORunner.MakeRunner()
      .then(runner => {
        return runner
          .arg(`compute domain records create ${zone}`)
          .arg(`--record-name ${recordName}`)
          .arg(`--record-type A`)
          .arg(`--record-data ${ipAddress}`)
          .arg(`--record-ttl 30`)
          .arg(`-o json`)
          .exec()
          .then((data) => {
            return (JSON.parse(data) as DNSRecord[])[0];
          })
      });
  }

  function _updateDNSARecord(recordId: number, zone: string, ipAddress: string): Promise<DNSRecord> {
    return DORunner.MakeRunner()
      .then(runner => {
        return runner
          .arg(`compute domain records update ${zone}`)
          .arg(`--record-id ${recordId}`)
          .arg(`--record-type A`)
          .arg(`--record-data ${ipAddress}`)
          .arg(`--record-ttl 30`)
          .arg(`-o json`)
          .exec()
          .then((data) => {
            return (JSON.parse(data) as DNSRecord[])[0];
          })
      });
  }

  return getDNSRecord(fqdn)
    .then(record => {
      if (record === undefined) {
        return _createDNSARecord(parsed.zone, parsed.subdomain, ipAddress);
      }
      else {
        if (record.data !== ipAddress) {
          return _updateDNSARecord(record.id, parsed.zone, ipAddress);
        }
        else {
          return record;
        }
      }
    })
}

function deleteDnsRecord(record: DNSRecord): Promise<void> {
  return DORunner.MakeRunner()
    .then((runner) => {
      console.log(`Deleting ${record.name} in ${record.zone} (${record.id})`)
      return runner
        .arg(`compute domain records delete ${record.zone} ${record.id}`)
        .arg('--force')
        .exec()
    })
    .then(() => {});
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
        describe: 'environment to create'
      })
    }, handleDelete)
  .argv;
}


function handleCreate(args: {environmentName: string}): Promise<any> {

  let definition: def.IEnvironmentDefinition = undefined;
  let dropletManager = new DropletManager();

  return def.getEnvironmentDefinition(args.environmentName)
    .catch((err: Error) => {
      console.error(`Could not read definition file: `, err.message);
      process.exit(1);
      return definition;
    })
    .then((d) => { definition = d; })
    .then(() => { console.info(`Checking if ${definition.dropletName} already exists`) })
    .then(() => dropletManager.getDroplet(definition.dropletName))
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

      console.info(`Droplet ${definition.dropletName} will be created`)
      return dropletManager.createDroplet(definition.dropletName);
    })
    .then((droplet) => {
      console.log(`Name: ${droplet.name}`);
      console.log(`Id: ${droplet.id}`);

      console.log(`IP: ${dropletManager.ipForDroplet(droplet)}`);

      return droplet;
    })
    .then((droplet) => {
      let firstPromise = Promise.resolve();
      let lastPromise: Promise<any> = firstPromise;

      let dropletIp = dropletManager.ipForDroplet(droplet);
      definition.domainNames.forEach(d => {
        lastPromise = lastPromise.then(() => {
          return createOrUpdateDNSARecord(d, dropletIp)
            .then((dns) => {
              console.log(`Created DNS record for ${d}`);
              console.log(dns);
            });
        });
      });

      return lastPromise.then(() => droplet);
    })
    .catch((err) => {
      console.error(`Error:`)
      console.error(err);
      process.exit(1);
    });
}

function handleDelete(args: {environmentName: string}): Promise<any> {
  let deleteActions: (() => Promise<any>)[] = [];
  let definition: def.IEnvironmentDefinition = undefined;

  let dropletManager = new DropletManager();

  return def.getEnvironmentDefinition(args.environmentName)
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
          return getDNSRecord(fqdn)
            .then((record) => {
              if (record !== undefined) {
                console.log(`Will delete DNS record ${fqdn} ${record.id}`)
                deleteActions.push((() => deleteDnsRecord(record)));
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

processArgs();
