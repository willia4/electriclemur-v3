import { DigitalOceanRunner } from './runner_digital_ocean';
import * as _parseDomain from 'parse-domain';

export interface IParsedDomain {
  subdomain: string,
  domain: string,
  tld: string,
  zone: string
}

export interface IDNSRecord {
  id: number,
  type: string,
  name: string,
  data: string,
  ttl: number,
  zone: string
}

export class DNSManager {
  private cached_dns_records: Map<string, IDNSRecord[]> = new Map<string, IDNSRecord[]>();
  public verbose: boolean = false;

  public parseDomain(domain: string): IParsedDomain {
    let p = _parseDomain(domain);
    p.zone = `${p.domain}.${p.tld}`;
    return p as IParsedDomain;
  }

  public getDNSRecordsInZone(zone: string): Promise<IDNSRecord[]> {
    return Promise.resolve()
      .then(() => {
        if ( this.cached_dns_records.has(zone) ) { return Promise.resolve(); }
        return DigitalOceanRunner.MakeRunner(this.verbose)
          .then((runner) => {
            return runner
                .arg(`compute domain records list ${zone}`)
                .arg('-o json')
                .exec();
          })
          .then((output) => { 
  
            let records = JSON.parse(output) as IDNSRecord[];
            records.forEach(r => { r.zone = zone; })
            this.cached_dns_records.set(zone, records);
          })
      })
      .then(() => this.cached_dns_records.get(zone));
  }

  public getDNSRecord(fqdn: string): Promise<IDNSRecord> {
    let parsed = this.parseDomain(fqdn);
    return this.getDNSRecordsInZone(parsed.zone)
      .then((records) => {
        let found: IDNSRecord[] = [];
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

  public createOrUpdateDNSARecord(fqdn: string, ipAddress: string): Promise<IDNSRecord> {
    const parsed = this.parseDomain(fqdn);
  
    let _createDNSARecord = (zone: string, recordName: string, ipAddress: string): Promise<IDNSRecord> => {
      if (!recordName) { throw `Cannot create new A record for ${zone} zone. Create this in the portal.`}
  
      return DigitalOceanRunner.MakeRunner(this.verbose)
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
              return (JSON.parse(data) as IDNSRecord[])[0];
            })
        });
    }
  
    let _updateDNSARecord = (recordId: number, zone: string, ipAddress: string): Promise<IDNSRecord> => {
      return DigitalOceanRunner.MakeRunner(this.verbose)
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
              return (JSON.parse(data) as IDNSRecord[])[0];
            })
        });
    }
  
    return this.getDNSRecord(fqdn)
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

  public deleteDnsRecord(record: IDNSRecord): Promise<void> {
    return DigitalOceanRunner.MakeRunner(this.verbose)
      .then((runner) => {
        console.log(`Deleting ${record.name} in ${record.zone} (${record.id})`)
        return runner
          .arg(`compute domain records delete ${record.zone} ${record.id}`)
          .arg('--force')
          .exec()
      })
      .then(() => {});
  }
}