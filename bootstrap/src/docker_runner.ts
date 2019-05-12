import { IEnvironmentDefinition } from './manager.environment';
import * as path from 'path';
import { RunnerBase } from './runner_base';

export class DockerRunner extends RunnerBase {
  static MakeRunner(environment: IEnvironmentDefinition): Promise<DockerRunner> {
    let runner = new DockerRunner('/usr/bin/docker');

    runner
      .arg(`--host tcp://${environment.fqdn}:2376`)
      .arg(`--tlsverify`)
      .arg(`--tlscacert '${path.join(environment.dockerCertPath, 'ca.pem')}'`)
      .arg(`--tlscert '${path.join(environment.dockerCertPath, 'cert.pem')}'`)
      .arg(`--tlskey '${path.join(environment.dockerCertPath, 'key.pem')}'`)

    return Promise.resolve(runner);
  }
}