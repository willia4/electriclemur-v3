#!/usr/bin/env node

import * as fs from 'fs';
import * as child from 'child_process';

import * as _parseDomain from 'parse-domain';

const yaml = require('yaml');
const DigitalOcean = require('do-wrapper').default;

class Runner {
  static MakeRunner(): Promise<Runner> {
    return Promise.resolve(new Runner('/home/willia4/bin/doctl'));
  }

  private _cmd: string = undefined;
  private _args: string[] = [];

  private constructor(cmd) {
    this._cmd = cmd;
  }

  public arg(newArg: string) {
    this._argStringToArray(newArg).forEach(a => { this._args.push(a); });
    return this;
  }

  public exec(): Promise<string> {
    return new Promise((resolve, reject) => {
      let fullCommand = this._cmd;

      let p = child.spawn(fullCommand, this._args);
      let stdErr = '';
      let stdOut = '';

      p.stderr.on('data', (data: Buffer) => { stdErr += data.toString(); });
      p.stdout.on('data', (data: Buffer) => { stdOut += data.toString(); });

      p.on('error', (err) => {
        stdErr += err.message;
        reject(err);
        return;
      });

      p.on('exit', (code) => {
        if (code === 0) { 
          resolve(stdOut);
        }
        else {
          reject(stdErr);
        }
        return;
      });

      p.on('close', (code) => {
        if (code === 0) { 
          resolve(stdOut);
        }
        else {
          reject(stdErr);
        }
        return;
      });
    });
  }

  private _argStringToArray(argString: string): string[] {
    var args = [];

    var inQuotes = false;
    var escaped = false;
    var arg = '';

    var append = function (c: any) {
        // we only escape double quotes.
        if (escaped && c !== '"') {
            arg += '\\';
        }

        arg += c;
        escaped = false;
    }

    for (var i = 0; i < argString.length; i++) {
        var c = argString.charAt(i);

        if (c === '"') {
            if (!escaped) {
                inQuotes = !inQuotes;
            }
            else {
                append(c);
            }
            continue;
        }

        if (c === "\\" && escaped) {
            append(c);
            continue;
        }

        if (c === "\\" && inQuotes) {
            escaped = true;
            continue;
        }

        if (c === ' ' && !inQuotes) {
            if (arg.length > 0) {
                args.push(arg);
                arg = '';
            }
            continue;
        }

        append(c);
    }

    if (arg.length > 0) {
        args.push(arg.trim());
    }

    return args;
}
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
  ttl: number
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
  return Runner.MakeRunner()
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
  return Runner.MakeRunner()
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

function getDNSRecordsInZone(zone: string): Promise<DNSRecord[]> {
  return Promise.resolve()
    .then(() => {
      if ( cached_dns_records.has(zone) ) { return Promise.resolve(); }
      return Runner.MakeRunner()
        .then((runner) => {
          return runner
              .arg(`compute domain records list ${zone}`)
              .arg('-o json')
              .exec();
        })
        .then((output) => { 
          cached_dns_records.set(zone, JSON.parse(output) as DNSRecord[]);
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

    return Runner.MakeRunner()
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
    return Runner.MakeRunner()
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
          return _updateDNSARecord(record.id,parsed.zone, ipAddress);
        }
      }
    })
}

var api: any;

const stagingDropletName = 'staging01';
const errorIfExists = false; 
let droplet: Droplet = undefined; 

const domainNames = [
  'staging.electriclemur.com',
  'jameswilliams.staging.electriclemur.com',
  'wishlist.jameswilliams.staging.electriclemur.com'
];


Promise.resolve()
.then(() => { console.info(`Checking if ${stagingDropletName} already exists`)})
.then(() => getDroplet(stagingDropletName))
.then((d) => {
  if (d !== undefined) { 
    if (errorIfExists) {
      throw `Droplet ${stagingDropletName} already exists\n\nRun doctl compute droplet delete ${stagingDropletName}`; 
    }
    console.info(`Droplet ${stagingDropletName} already exists and will not be created`)
    return Promise.resolve(d);
  }

  console.info(`Droplet ${stagingDropletName} will be created`)
  return createDroplet(stagingDropletName);
})
.then((d) => {
  droplet = d; 

  console.log(`Name: ${droplet.name}`);
  console.log(`Id: ${droplet.id}`);

  console.log(`IP: ${ipForDroplet(droplet)}`);
})

.then(() => {
  let firstPromise = Promise.resolve();
  let lastPromise: Promise<any> = firstPromise;

  let dropletIp = ipForDroplet(droplet);
  domainNames.forEach(d => {
    lastPromise = lastPromise.then(() => {
      return createOrUpdateDNSARecord(d, dropletIp)
        .then((dns) => {
          console.log(`Created DNS record for ${d}`);
          console.log(dns);
        });
    });
  });

  return firstPromise;
})

.catch((err) => {
  console.error(`Error:`)
  console.error(err);
  process.exit(1);
});