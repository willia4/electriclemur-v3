import * as child from 'child_process';
import * as path from 'path';

import { IEnvironmentDefinition } from './manager.environment';
import { ScriptRunner } from './script_runner';

export type PlaybooksT = "init-host" | "upload-files";
export type AnsibleExeT = "ansible" | "ansible-playbook";

export interface IAnsibleResult {
  changed: boolean;
  msg?: string;
}
export interface IAnsibleCommand<ResultT extends IAnsibleResult> {
  module: string;
  args: string;
  skipVolumes: boolean;
  parseOutput?(output: string): ResultT;
}


export class AnsibleRunner {
  static get AnsibleArtifactsPath(): string {
    return path.normalize(path.join(path.normalize(__dirname), '../ansible'));
  }

  static RunPlaybook(environment: IEnvironmentDefinition, playbook: PlaybooksT, verbose: boolean = false): Promise<void> {
    const skipVolumes = (playbook === "init-host");
    const playbookPath = path.join(AnsibleRunner.AnsibleArtifactsPath, `${playbook}.yaml`);

    return AnsibleRunner.MakeAnsibleRunner(environment, 'ansible-playbook', skipVolumes, verbose)
    .then((runner) => runner.exec(playbookPath))
    .then(() => {})
  }

  static RunCommand<CommandT extends IAnsibleCommand<ResultT>, ResultT extends IAnsibleResult>(environment: IEnvironmentDefinition, command: CommandT, verbose: boolean = false): Promise<ResultT> {
    return AnsibleRunner.MakeAnsibleRunner(environment, 'ansible', command.skipVolumes, verbose)
      .then((runner) => runner.exec(`all -m ${command.module} -a "${command.args}"`))
      .then((output) => {
        if (command.parseOutput) {
          return command.parseOutput(output);
        }
        
        let json = output.replace(/^.*?{/, '{'); //replace everything up-to (and including!) the first { with just { so now it should be a JSON string
        return (JSON.parse(json) as ResultT);
      })
  }

  static MakeAnsibleRunner(environment: IEnvironmentDefinition, ansibleExe: AnsibleExeT, skipVolumes: boolean, verbose: boolean = false): Promise<AnsibleRunner> {

    const inventoryScript = skipVolumes ? `${environment.environmentName}-inventory-no-volumes.sh` : `${environment.environmentName}-inventory.sh`;
    const inventoryPath = path.join(AnsibleRunner.AnsibleArtifactsPath, inventoryScript);

    let runner = new AnsibleRunner(`/usr/bin/${ansibleExe}`, inventoryPath);
    runner.verbose = verbose;

    return Promise.resolve(runner);
  }

  public verbose: boolean = false; 

  private constructor(
    private _ansiblePath: string,
    private _inventoryPath: string) {  }


  public exec(command: string): Promise<string> {
    let fullCommand = `${this._ansiblePath} -i ${this._inventoryPath} ${command}`;

    return ScriptRunner.MakeRunner()
      .then((scriptRunner) => {
        scriptRunner.echoOutput = this.verbose;

        scriptRunner.setEnvironmentVariable('ANSIBLE_HOST_KEY_CHECKING', 'False');
        return scriptRunner.exec(fullCommand);
      });
  }
}

