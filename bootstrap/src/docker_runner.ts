import { IEnvironmentDefinition } from './manager.environment';
import * as child from 'child_process';
import * as path from 'path';

export class DockerRunner {
  static MakeRunner(environment: IEnvironmentDefinition): Promise<DockerRunner> {
    let runner = new DockerRunner('/usr/bin/docker');
    // docker --host tcp://staging.electriclemur.com:2376 --tlsverify --tlscacert ./ca.pem --tlscert ./cert.pem --tlskey ./key.pem volume

    runner
      .arg(`--host tcp://${environment.fqdn}:2376`)
      .arg(`--tlsverify`)
      .arg(`--tlscacert '${path.join(environment.dockerCertPath, 'ca.pem')}'`)
      .arg(`--tlscert '${path.join(environment.dockerCertPath, 'cert.pem')}'`)
      .arg(`--tlskey '${path.join(environment.dockerCertPath, 'key.pem')}'`)

    return Promise.resolve(runner);
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
    return new Promise((resolve, reject) => {
      let fullCommand = this._cmd;

      let p = child.spawn(fullCommand, this._args);
      let stdErr = '';
      let stdOut = '';

      p.stderr.on('data', (data: Buffer) => { stdErr += data.toString(); });
      p.stdout.on('data', (data: Buffer) => { stdOut += data.toString(); });

      p.on('error', (err) => {
        stdErr += err.message;
        reject(err);
        return;
      });

      p.on('exit', (code) => {
        if (code === 0) { 
          resolve(stdOut);
        }
        else {
          reject(stdErr);
        }
        return;
      });

      p.on('close', (code) => {
        if (code === 0) { 
          resolve(stdOut);
        }
        else {
          reject(stdErr);
        }
        return;
      });
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