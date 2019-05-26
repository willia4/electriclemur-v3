import { IEnvironmentDefinition } from './manager.environment';
import * as path from 'path';
import { RunnerBase } from './runner_base';

export class DockerRunner extends RunnerBase {
  static MakeRunner(environment: IEnvironmentDefinition): Promise<DockerRunner> {
    return Promise.resolve(new DockerRunner(environment));
  }

  static GetDockerEnvironmentVariables(environment: IEnvironmentDefinition): Promise<{[key: string]: string}> {
    let r: {[key: string]: string} = {
      "DOCKER_TLS_VERIFY": "1",
      "DOCKER_HOST": `tcp://${environment.fqdn}:2376`,
      "DOCKER_CERT_PATH": `${environment.dockerCertPath}`
    };

    return Promise.resolve(r);
  }

  public get environment(): IEnvironmentDefinition { return this._environment; }

  constructor(private _environment: IEnvironmentDefinition) {
    super('/usr/bin/docker');

    this.arg(`--host tcp://${_environment.fqdn}:2376`)
    this.arg(`--tlsverify`)
    this.arg(`--tlscacert '${path.join(_environment.dockerCertPath, 'ca.pem')}'`)
    this.arg(`--tlscert '${path.join(_environment.dockerCertPath, 'cert.pem')}'`)
    this.arg(`--tlskey '${path.join(_environment.dockerCertPath, 'key.pem')}'`)
  }

  public clone(): Promise<DockerRunner> {
    return Promise.resolve(new DockerRunner(this._environment));
  }
}
