import { IEnvironmentDefinition } from "./manager.environment";
import { IContainer, IContainerDefinition, ContainerManager } from "./manager.container";
import * as common from './common';
import * as ansible from './ansible_commands';
import { VolumeManager, IVolumeDefinition, IVolume } from "./volume_manager";
import { promises } from "fs";
import { DockerRunner } from "./runner_docker";
import { SecretManager } from "./manager.secrets";

export interface IDatabaseBackup {
  path: string;
  volumePath: string;
  databaseName: string;
  volume: IVolume
}

export class DatabaseManager {
  constructor(
    private _environment: IEnvironmentDefinition,
    private _verbose: boolean
  ) {}

  public getOrCreateDatabaseContainer(): Promise<IContainer> {
    let containerDef: IContainerDefinition = {
      name: 'database',
      image: 'mariadb:10.4.5',
      volumes: [
        {
          mountPoint: "/var/lib/mysql",
          type: "database"
        }
      ],
      env: {
        'MYSQL_ROOT_PASSWORD': { secretName: 'database_root_password'}
      }
    }
  
    console.log('Creating database container')
    let containerManager = new ContainerManager();
    return containerManager.getContainer(this._environment, containerDef.name, this._verbose)
      .then((container) => {
        if (container !== undefined) { 
          console.log('Database container already exists')
          return Promise.resolve(container); 
        }

        return containerManager.createContainerFromDefinition_noSFTP(this._environment, containerDef, this._verbose)
          .then((container) => { 
            console.log('Created database container');
            return container;
          });
      });
  }

  public getDatabaseBackups(): Promise<IDatabaseBackup[]> {
    console.log('Getting list of available database backups');
    
    let volumeManager = new VolumeManager(this._environment);
    return volumeManager.getVolumeDefinitions()
      .then((volumes) => volumes.filter(v => v.name === 'database_backup')[0])
      .then((volume) => volumeManager.getVolume(volume))
      .then((volume) => {
        
        return ansible.listFiles(this._environment, volume.Mountpoint, "*.sqldump", true, this._verbose)
          .then((files) => {
            return files.map((f) => {
              let r: IDatabaseBackup = {
                path: f,
                databaseName: f.replace(/^.*\/(.*)\.sqldump$/, "$1"),
                volumePath: f.replace(volume.Mountpoint, ''),
                volume: volume
              }
    
              return r;
            })
          })
      })      
  }

  public databaseExists(databaseName: string): Promise<boolean> {
    return this.makeDatabaseRunner()
      .then((runner) => {
        return runner
          .arg(`"SELECT count(*) FROM information_schema.schemata WHERE schema_name = '${databaseName}'"`)
          .exec()
          .then((result) => {
            return parseInt(result, 10) > 0;
          })
      })
  }

  public restoreDatabase(backup: IDatabaseBackup): Promise<any> {
    console.log(`Restoring database: ${backup.databaseName}`);
    return this.makeDatabaseRunner(backup.volume)
      .then((runner) => {
        runner.arg(`"source /v/${backup.volumePath}"`)

        return runner.exec();
      });    
  }

  public restoreDatabases(): Promise<any> {
    console.log('Restoring databases');

    return this.getDatabaseBackups()
      .then((backups) => {
        let lastPromise: Promise<any> = Promise.resolve();

        backups.forEach(b => {
          lastPromise = lastPromise.then(() => {
            return this.databaseExists(b.databaseName)
              .then((exists) => {
                if (exists) {
                  console.log(`Database ${b.databaseName} already exists`)
                  return Promise.resolve();
                }

                return this.restoreDatabase(b).then(() => {})
              })
          })  
        })

        return lastPromise;
      })
    
  }
  
  private makeDatabaseRunner(mountVolume: IVolume = undefined): Promise<DockerRunner> {
    let secretManager = new SecretManager(this._environment, this._verbose);
    return secretManager.readEnvironmentSecret('database_root_password')
      .then((password) => {
        return DockerRunner.MakeRunner(this._environment)
          .then((runner) => {
            runner.echoOutput = this._verbose;

              runner.arg('run');
              runner.arg('--rm');
              runner.arg('--link database');
              
              if (mountVolume) {
                runner.arg(`-v ${mountVolume.Name}:/v`)
              }

              runner.arg('mariadb:10.4.5');
              
              runner.arg('mysql');
              runner.arg('-h database');
              runner.arg('-u root');
              runner.arg(`--password=${password}`);
              runner.arg('--skip-column-names');
              runner.arg('-e');

              return runner;
          })
      })
  }
}