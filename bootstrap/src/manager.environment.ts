import * as path from 'path';
import * as fs from 'fs';

interface IEnvironmentDefinition_JSON {
  environmentName: string,
  dropletName: string,
  domainNames: string[],
  urlMap: {key: string, value: string}[]
}

export interface IEnvironmentDefinition extends IEnvironmentDefinition_JSON {
  fqdn: string,
  secretPath: string,
  dockerCertPath: string
}

export class EnvironmentManager {
  static getEnvironmentDefinition(environmentName: string): Promise<IEnvironmentDefinition> {
    const definitionPath =  path.normalize(path.join(path.normalize(__dirname), `../../environments/${environmentName}.json`));
    const secretsPath = path.normalize(path.join(path.normalize(__dirname), `../../secrets/${environmentName}`));

    return (new Promise<string>((resolve ,reject) => {
      fs.readFile(definitionPath, { encoding: "utf8" }, (err, contents) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(contents);
        return;
      });
    }))
    .then((contents) => JSON.parse(contents) as IEnvironmentDefinition_JSON)
    .then((e) => {
      let fqdn = e.domainNames[0];

      let r: IEnvironmentDefinition = {
        environmentName: e.environmentName,
        dropletName: e.dropletName,
        domainNames: e.domainNames,
        urlMap: e.urlMap,
        fqdn: fqdn,
        secretPath: secretsPath,
        dockerCertPath: path.join(secretsPath, `docker_certs/${fqdn}/client`)
      };

      return r;
    });
  }  
}
