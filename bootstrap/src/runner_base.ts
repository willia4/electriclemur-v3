import * as child from 'child_process';

export class RunnerBase {

  private _cmd: string = undefined;
  private _args: string[] = [];

  public constructor(cmd) {
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