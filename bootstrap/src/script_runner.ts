import * as child from 'child_process';

export class ScriptRunner {
  static MakeRunner(): Promise<ScriptRunner> {
    return Promise.resolve(new ScriptRunner());
  }

  private _environment: NodeJS.ProcessEnv = {};
  public shell: string = '/bin/bash';

  constructor() {
    for(let e in process.env) {
      if (process.env.hasOwnProperty(e) && process.env[e]) {
        this._environment[e] = process.env[e];
      }
    }
  }

  public setEnvironmentVariable(key: string, value: string) {
    this._environment[key] = value;
  }

  public unsetEnvironmentVariable(key: string) {
    delete this._environment[key];
  }

  public exec(cmd: string, echoOutput: boolean = false): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      let p = child.exec(cmd, {
        shell: this.shell,
        env: this._environment
      });

      let stdErr = '';
      let stdOut = '';
      p.stderr.on('data', (data: Buffer) => {
        if (echoOutput) { console.error(data.toString()); }
        stdErr += data.toString();
      })

      p.stdout.on('data', (data: Buffer) => {
        if (echoOutput) { console.log(data.toString()); }
        stdOut += data.toString();
      });

      p.on('error', (err) => {
        stdErr += err.message;
        return reject(err);
      });

      p.on('exit', (code) => {
        if (code === 0) {
          return resolve(stdOut);
        }
        else {
          return reject(stdErr);
        }
      });

      p.on('close', (code) => {
        if (code === 0) {
          return resolve(stdOut);
        }
        else {
          return reject(stdErr);
        }
      });
    });
  }
}