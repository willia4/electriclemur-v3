import * as child from 'child_process';
import * as path from 'path';

import { IEnvironmentDefinition } from './manager.environment';
import { ScriptRunner } from './script_runner';

export type PlaybooksT = "configure-docker-certs" | "upload-files";

export class AnsibleRunner {
  static RunPlaybook(environment: IEnvironmentDefinition, playbook: PlaybooksT): Promise<void> {
    const ansiblePath = path.normalize(path.join(path.normalize(__dirname), '../ansible'));

    const skipVolumes = (playbook === "configure-docker-certs");

    const inventoryScript = skipVolumes ? `${environment.environmentName}-inventory-no-volumes.sh` : `${environment.environmentName}-inventory.sh`;
    const inventoryPath = path.join(ansiblePath, inventoryScript);
    const playbookPath = path.join(ansiblePath, `${playbook}.yaml`);

    let runner = new AnsibleRunner('/usr/bin/ansible-playbook', inventoryPath, playbookPath);
    return runner.exec().then(() => {});
  }

  private constructor(
    private _ansiblePath: string,
    private _inventoryPath: string,
    private _playbookPath: string) {  }


  public exec(): Promise<string> {
    let fullCommand = `${this._ansiblePath} -i ${this._inventoryPath} ${this._playbookPath}`;

    return ScriptRunner.MakeRunner()
      .then((scriptRunner) => {
        scriptRunner.setEnvironmentVariable('ANSIBLE_HOST_KEY_CHECKING', 'False');
        return scriptRunner.exec(fullCommand, true);
      });
  }
}