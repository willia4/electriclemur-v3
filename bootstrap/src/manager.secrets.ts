import { IEnvironmentDefinition } from "./manager.environment";
import * as common from './common';
import * as path from 'path';

export interface IDatabaseSecret {
  username: string;
  password: string;
}

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

  public readDatabaseSecrets(): Promise<{[databaseName: string]: IDatabaseSecret}> {
    let secretPath = path.join(this._environment.secretPath, 'database_passwords.json');
    
    if (this._verbose) { 
      console.log(`Reading all database secrets from ${secretPath}`);
    }

    return common.readFileAsync(secretPath)
      .then((f) => JSON.parse(f) as IDatabaseSecretFile)
      .then((s) => s.databases);
  }

  public readDatabaseSecret(database: string): Promise<IDatabaseSecret> {
    let secretPath = path.join(this._environment.secretPath, 'database_passwords.json');
    
    if (this._verbose) { 
      console.log(`Reading database secret for ${database} from ${secretPath}`);
    }

    return common.readFileAsync(secretPath)
      .then((f) => JSON.parse(f) as IDatabaseSecretFile)
      .then((s) => {
        if (!s.databases.hasOwnProperty(database)) { return Promise.reject(`Could not find database ${database} in ${secretPath}`); }
        return s.databases[database];
      })
  }
}

interface IDatabaseSecretFile {
  databases: {
    [databaseName: string]: IDatabaseSecret;
  };
}