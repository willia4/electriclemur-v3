import { IEnvironmentDefinition } from "./manager.environment";
import * as common from './common';
import * as path from 'path';

export class SecretManager { 
  constructor(private _environment: IEnvironmentDefinition, private _verbose: boolean) {

  }

  public readEnvironmentSecret(name: string): Promise<string> {
    let secretPath = path.join(this._environment.secretPath, 'environment_secrets.json');

    if (this._verbose) { 
      console.log(`Reading secret ${name} from ${secretPath}`);
    }

    return common.readFileAsync(secretPath)
      .then((f) => JSON.parse(f) as {[K:string]: string})
      .then((s) => {
        if (!s.hasOwnProperty(name)) { return Promise.reject(`Could not find ${name} in ${secretPath}`); }
        return s[name];
      });
  }
}