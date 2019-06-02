import { IAnsibleResult, IAnsibleCommand, AnsibleRunner } from './ansible_runner';
import { IEnvironmentDefinition } from './manager.environment';
import { create } from 'domain';

export function directoryExists(environment: IEnvironmentDefinition, path: string, verbose: boolean = false): Promise<boolean> {
  console.log(`Checking if directory ${path} exists in ${environment.fqdn}`)
  let stat = new StatCommand(path);

  return AnsibleRunner.RunCommand<StatCommand, IStatResult>(environment, stat, verbose)
    .then((statResult) => statResult.stat.exists);
}

export function createDirectory(environment: IEnvironmentDefinition, path: string, verbose: boolean = false): Promise<void> {
  return directoryExists(environment, path, verbose)
    .then((exists) => {
      if (exists) {
        console.log(`Directory ${path} already exists`);
        return;
      }
      else {
        console.log(`Directory ${path} does not exist and will be created`);
        
        let createCommand = new FileCommand(path, 'directory', undefined)
        return AnsibleRunner.RunCommand<FileCommand, IFileResult>(environment, createCommand, verbose)
          .then((result) => {
            console.log(`Created directory ${result.path}`);
          });
      }
    })
}

export function setFileMode(environment: IEnvironmentDefinition, path: string, mode: string, verbose: boolean = false): Promise<void> {
  console.log(`Setting mode of ${path} to ${mode}`);

  let cmd = new FileCommand(path, undefined, mode);
  return AnsibleRunner.RunCommand<FileCommand, IFileResult>(environment, cmd, verbose)
    .then((result) => { })

}

export function uploadFile(environment: IEnvironmentDefinition, src: string, dest: string, verbose: boolean = false): Promise<ICopyResult> {
  console.log(`Uploading ${src} to ${dest}`);
  let cmd = new CopyCommand(src, dest);
  return AnsibleRunner.RunCommand<CopyCommand, ICopyResult>(environment, cmd, verbose)
    .then((result) => {
      if (verbose) { console.log(`Uploaded ${result.dest}: ${result.checksum}`); }
      return result;
    })
}

export function uploadFiles(environment: IEnvironmentDefinition, files: string[], dest: string, verbose: boolean = false): Promise<void> {
  let lastPromise: Promise<any> = Promise.resolve();
  files.forEach(f => {
    lastPromise = lastPromise.then(() => uploadFile(environment, f, dest, verbose))
  });

  return lastPromise.then(() => {});
}

export function removeLineFromFile(environment: IEnvironmentDefinition, file: string, regex: string, verbose: boolean = false): Promise<void> {
  console.log(`Removing lines from ${file} that match "${regex}"`);
  let cmd = new LineInFileCommand(file, regex, undefined, 'absent');
  return AnsibleRunner.RunCommand<LineInFileCommand, ILineInFileResult>(environment, cmd, verbose)
    .then((result) => {
      console.log(`Lines removed: ${result.changed}`);
    });
}

export function addLineToFile(environment: IEnvironmentDefinition, file: string, line: string, verbose: boolean = false): Promise<void> {
  console.log(`Adding lines "${line}" to ${file}`);
  let cmd = new LineInFileCommand(file, undefined, line, 'present');
  return AnsibleRunner.RunCommand<LineInFileCommand, ILineInFileResult>(environment, cmd, verbose)
    .then((result) => {
      console.log(`Line added: ${result.changed}`)
    });
}

export function runCommand(environment: IEnvironmentDefinition, command: string, verbose: boolean = false): Promise<void> {
  console.log(`Running command "${command}"`);
  let cmd = new CommandCommand(command);
  return AnsibleRunner.RunCommand(environment, cmd, verbose)
    .then((result) => {
      if (result.changed) {
        console.log('Success')
        return;
      }
      
      return Promise.reject(result.msg);
    });
}

export function listFiles(environment: IEnvironmentDefinition, remotePath: string, verbose: boolean = false): Promise<string[]> {
  console.log(`Listing files in ${remotePath}`);
  let cmd = new FindCommand(remotePath);
  return AnsibleRunner.RunCommand<FindCommand, IFindResult>(environment, cmd, verbose)
    .then((result) => {
      console.log(`Found ${result.examined} files`);
      let r = result.files.map(f => f.path);
      if (verbose) { console.log(r); }
      return r;
    })
}

export interface IStatResult extends IAnsibleResult {
  stat: {
    exists: boolean;
  }
}

export class StatCommand implements IAnsibleCommand<IStatResult> {

  public module: string = "stat";
  public skipVolumes: boolean = true;

  public get args(): string {
    return `path=${this._directory}`;
  }

  constructor(private _directory: string) {

  }
}

export type FileCommandStateT = 'directory' | undefined;

export interface IFileResult extends IAnsibleResult {
  path: string;
  state: string;
}

export class FileCommand implements IAnsibleCommand<IFileResult> {
  public module: string = "file";
  public skipVolumes: boolean = true; 

  public get args(): string {
    let r = `path=${this._path}`;
    if (this._state) {
      r = `${r} state=${this._state}`;
    }
  
    if (this._mode) {
      r = `${r} mode=${this._mode}`;
    }

    return r;
  }

  constructor(
    private _path: string, 
    private _state: FileCommandStateT, 
    private _mode: string) {

  }
}

export interface ICopyResult extends IAnsibleResult {
  checksum: string;
  dest: string;
  gid: number;
  group: string; 
  mode: string;
  owner: string;
  path: string;
  secontext: string;
  size: number;
  state: string;
  uid: number;
}

export class CopyCommand implements IAnsibleCommand<ICopyResult> {
  public module: string = "copy";
  public skipVolumes: boolean = true;

  public get args(): string {
    return `src=${this.src} dest=${this.dest}`;
  }

  constructor(public src: string, public dest: string) {

  }
}

export interface ILineInFileResult extends IAnsibleResult {

}

export type LineInFileStateT = 'present' | 'absent';

export class LineInFileCommand implements IAnsibleCommand<ILineInFileResult> {
  public module: string = 'lineinfile';
  public skipVolumes: boolean = true; 

  public get args() : string {
    let r = `dest=${this._dest} state=${this._state}`;

    if (this._regex) {
      r = `${r} regexp="${this._regex}"`;
    }

    if (this._line) {
      r = `${r} line="${this._line}"`;
    }

    return r;
  }

  constructor(
    private _dest: string, 
    private _regex: string, 
    private _line: string, 
    private _state: LineInFileStateT) {

  }
}

export class CommandCommand implements IAnsibleCommand<IAnsibleResult> {
  public module: string = 'command'
  public skipVolumes: boolean = true;

  public get args(): string {
    return this._command;
  }

  public parseOutput(output: string): IAnsibleResult {
    let r: IAnsibleResult = {
      changed: (output.indexOf('SUCCESS') >= 0),
      msg: output
    };

    return r;
  }
  
  constructor(private _command: string) {

  }
}

export interface IFindResult extends IAnsibleResult {
  examined: number;
  files: {
    path: string;
    mode: string;
  }[]
}

export class FindCommand implements IAnsibleCommand<IFindResult> {
  public module: string = 'find'
  public skipVolumes: boolean = true;
  public get args(): string {
    return `paths=${this._path}`;
  }

  constructor(private _path: string) { }
}

