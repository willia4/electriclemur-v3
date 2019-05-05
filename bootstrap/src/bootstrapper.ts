#!/usr/bin/env node
import { DORunner } from './do_runner';
import * as yargs from 'yargs';
import * as fs from 'fs';
import * as path from 'path';
import * as _parseDomain from 'parse-domain';
import * as inquirer from 'inquirer';

const yaml = require('yaml');

interface IEnvironmentDefinition {
  environmentName: string,
  dropletName: string,
  domainNames: string[]
}

interface Droplet {
  id: number,
  name: string,
  memory: number,
  vcpus: number,
  disk: number,
  size_slug: string,
  region: { 
    slug: string,
    name: string
  },
  image: {
    id: number,
    name: string,
    distribution: string
  },
  networks: {
    v4: [
      {
        ip_address: string,
        type: string
      }
    ]
  },
  created_at: string
}

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

function ipForDroplet(droplet: Droplet): string {
  if (droplet === undefined) { return undefined; }
  let networks = droplet.networks.v4.filter(n => n.type === 'public');
  return networks.length > 0 ? networks[0].ip_address : undefined;
}

function getDroplets(): Promise<Droplet[]> {
  return DORunner.MakeRunner()
    .then((runner) => {
      return runner
          .arg('compute droplet list')
          .arg('-o json')
          .exec();

    })
    .then((output) => { 
      return JSON.parse(output) as Droplet[];
     });
}

function getDroplet(name: string): Promise<Droplet> {
  return getDroplets()
    .then((droplets) => droplets.filter((d => d.name === name)))
    .then((droplets) => {
      if (droplets.length <= 0) { return undefined;}
      return droplets[0];
    });
}

function createDroplet(name: string): Promise<Droplet> {
  return DORunner.MakeRunner()
    .then((runner) => {
      return runner
        .arg(`compute droplet create ${name}`)
        .arg(`--enable-private-networking`)
        .arg(`--image fedora-28-x64-atomic`)
        .arg(`--size s-1vcpu-2gb`)
        .arg(`--region nyc3`)
        .arg(`--ssh-keys b2:32:08:e6:3b:9b:17:c8:21:4e:a9:c5:bb:66:56:60`)
        .arg(`--wait`)
        .arg(`-o json`)
        .exec();
    })
    .then((output) => {
      const droplets = JSON.parse(output) as Droplet[];
      return droplets[0];
    });
}

function deleteDroplet(droplet: Droplet): Promise<void> {
  return DORunner.MakeRunner()
    .then((runner) => {
      console.log(`Deleting droplet ${droplet.name} (${droplet.id})`);
      return runner
        .arg(`compute droplet delete ${droplet.id}`)
        .arg('--force')
        .exec()
    })
    .then(() => {})
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

function getEnvironmentDefinition(environmentName: string): Promise<IEnvironmentDefinition> {
  return (new Promise<string>((resolve ,reject) => {
    const definitionPath =  path.normalize(path.join(path.normalize(__dirname), `../${environmentName}.json`));

    fs.readFile(definitionPath, { encoding: "utf8" }, (err, contents) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(contents);
      return;
    });
  }))
  .then((contents) => JSON.parse(contents) as IEnvironmentDefinition);

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

  let definition: IEnvironmentDefinition = undefined;

  return getEnvironmentDefinition(args.environmentName)
    .catch((err: Error) => {
      console.error(`Could not read definition file: `, err.message);
      process.exit(1);
      return definition;
    })
    .then((d) => { definition = d; })
    .then(() => { console.info(`Checking if ${definition.dropletName} already exists`) })
    .then(() => getDroplet(definition.dropletName))
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
      return createDroplet(definition.dropletName);
    })
    .then((droplet) => {
      console.log(`Name: ${droplet.name}`);
      console.log(`Id: ${droplet.id}`);

      console.log(`IP: ${ipForDroplet(droplet)}`);

      return droplet;
    })
    .then((droplet) => {
      let firstPromise = Promise.resolve();
      let lastPromise: Promise<any> = firstPromise;

      let dropletIp = ipForDroplet(droplet);
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
  let definition: IEnvironmentDefinition = undefined;

  return getEnvironmentDefinition(args.environmentName)
    .catch((err: Error) => {
      console.error(`Could not read definition file: `, err.message);
      process.exit(1);
      return definition;
    })
    .then((d) => { definition = d; })
    .then(() => getDroplet(definition.dropletName))
    .then((droplet) => { 
      if (droplet !== undefined) {
        console.log(`Will delete droplet ${droplet.name} (${droplet.id})`);
        deleteActions.push((() => deleteDroplet(droplet)));
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
