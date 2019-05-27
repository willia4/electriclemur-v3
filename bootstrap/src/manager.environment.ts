import * as path from 'path';
import * as common from './common';

interface IEnvironmentDefinition_JSON {
  environmentName: string,
  dropletName: string,
  domainNames: string[],
  urlMap: {key: string, value: string}
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

    return common.readFileAsync(definitionPath)
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
