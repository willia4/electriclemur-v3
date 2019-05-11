import * as path from 'path';
import * as fs from 'fs';

export interface IEnvironmentDefinition {
  environmentName: string,
  dropletName: string,
  domainNames: string[],
  urlMap: {key: string, value: string}[]
}

export function getEnvironmentDefinition(environmentName: string): Promise<IEnvironmentDefinition> {
  return (new Promise<string>((resolve ,reject) => {
    const definitionPath =  path.normalize(path.join(path.normalize(__dirname), `../../environments/${environmentName}.json`));

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