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

    return this.MakeRunner()
      .then((runner) => {
        return runner
          .arg(`-i ${inventoryPath}`)
          .arg(`${playbookPath}`)
          .exec()
      })
      .then(() => {});
  }

  static MakeRunner(): Promise<AnsibleRunner> {
    return Promise.resolve(new AnsibleRunner('/usr/bin/ansible-playbook'));
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
    let fullCommand = [this._cmd, ...this._args].join(' ');

    return ScriptRunner.MakeRunner()
      .then((scriptRunner) => {
        scriptRunner.setEnvironmentVariable('ANSIBLE_HOST_KEY_CHECKING', 'False');
        return scriptRunner.exec(fullCommand, true);
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