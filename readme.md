# Electric Lemur 3.0

## Introduction

For Electric Lemur 3.0, the Electric Lemur family of sites will run on a single node hosted by Digital Ocean. 

The websites will run as docker containers, orchestrated by custom CLI scripts (written in TypeScript) and reverse-proxied by [Traefik][].

[Traefik]: https://traefik.io/

Several websites simply serve up static files. These files are stored as volumes connected to the appropriate containers;
during bootstrapping, the files will be restored from a backup in S3.

The volumes for the static sites are also connected to an SFTP container
with a unique port assignment to allow end-user editing of the content.

There is a mariadb container hosting databases for the various sites. The files backing the databases are also stored in a volume
connected to the database container and the databases are also restored by the bootstrapper from a backup in S3.

The code in this repository is capable of initializing and maintaining this node. 

All commands below assume that the current directory is the directory that contains this readme file. 

## Bootstrap 

Bootstrapping must be done across two phases.

### Phase 1 - Compile the automation

The scripts used to bootstrap and manage the environment are written in TypeScript. 

Because the compiled version of the scripts are not stored in source control, you will be required to compile them.

Restore npm packages in the usual way: 

    cd ./bootstrap
    npm install 
    cd ..

To compile tbe scrips once, use the command 

    tsc -p ./bootstrap/

However, it is often convenient to open a separate terminal window and run `tsc` with the `--watch` parameter to continuously compile the scripts as they change. 

    tsc --watch -p ./bootstrap/

### Phase 2 - Bootstrap the environment

You can then bootstrap for a particular environment with the bootstrap script. For example, to bootstrap the `staging` environment: 

     ./bootstrap/bootstrap.sh staging

See below for how to define an environment. 

## Container management 

Containers are specified as JSON files in the `containers` directory. 

The bootstrapper will load all container definitions, however there is
also a container CLI that can be used to manage them over time. 

    ./bootstrap/dist/container.js --help

## Environment Definition 

Environments such as "staging" or "production" are defined via a few different files. The environment name like "staging" or "production" below is represented as `ENVIRONMENT`. 

- `./environments/ENVIRONMENT.json` -- a JSON file that maps to `IEnvironmentDefinition_JSON` from the bootstrapper
- `./bootstrap/ENVIRONMENT-inventory.sh` and `./bootstrap/ENVIRONMENT-inventory-no-volumes.sh` -- Ansible dynamic inventory scripts, these funnel through to the `ansible-hosts` node script

## Secrets

Secrets are housed in the `./secrets/` directory; most of this directory is not committed to source control. 
The exception to this is the `./secrets/scripts/` directory which houses some secret management scripts that 
are not actually sensitive. 

In order to use these scripts, you should create the appropriate directory structure. In addition to an 
`/aws/` directory, you will need a directory for each environment (such as `/staging/` or `/production/`).

    ./secrets/
       /aws/
       /staging/
       /production/
       /...etc for each environment.../

#### AWS Secrets
The `./secrets/aws/` directory needs to contain two files `backup_access_key.txt` and `/backup_access_secret.txt`. These should contain the access key and access secret to allow access to an AWS bucket for restoring backups. 

#### SFTP Secrets
The `./secrets/ENVIRONMENT/ssh_volumes/keys/` directory should contain the private and public keys for the 
SFTP containers that allow readwrite access to static files. Documentation for creating these keys is available
from the SFTP container image, [willia4/sftp-volume][].

[willia4/sftp-volume]: https://github.com/willia4/sftp-volume

The `./secrets/ENVIRONMENT/ssh_volumes/user/` directory should contain an `authorized_keys` file which is a 
standard SSH file that determines who has access to the static volumes via SFTP. 

#### Environment Secrets

Each environment has three top level `./secrets/ENVIRONMENT/mariadb_root_password.txt`, `./secrets/ENVIRONMENT/database_passwords.json` and `./secrets/ENVIRONMENT/environment_secrets.json` file. 

The contents of `mariadb_root_password.txt` is the root password to use for the mariadb container. 

`databasepasswords.json` lists the user-level passwords for each database. The contents of this file would be 
of the form

    {
        "databases": {
            "databaseName": { "username": "foo", "password": "bar" }
        }
    }

`environment_secrets.json` contains secrets to be passed into environment variables of the containers. The contents of this file would be of the form

    {
        "secretName": "secretValue"
    }

The keys for these files are referenced in the container definition via the `{ "secretName": string }` 
construction.

#### Docker TLS

The bootstrapper will create a `./secrets/ENVIRONMENT/docker_certs/` directory to store TLS certificates 
used to securely connect to docker. 


## Connect to Docker 

To easily connect to the docker engine for an environment run 

    source <(./bootstrap/dist/container.js print-env staging)

    source <(./bootstrap/dist/container.js print-env production)

This will your current bash session with the environment variables needed to transparently run `docker` commands. 

Validate with `docker info`.
