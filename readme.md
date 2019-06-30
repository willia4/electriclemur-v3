# Electric Lemur 3.0

## Introduction

For Electric Lemur 3.0, the Electric Lemur family of sites will run on a single node hosted by Digital Ocean. 

The web sites will run as docker containers, orchestrated by docker-compose. 

The code in this repository is capable of initializing and maintaining this node. 

All commands below assume that the current directory is the directory that contains this readme file. 

## Bootstrap 

Bootstrapping must be done across multiple phases.

### Phase 1 - Step 0 - Compile the automation

The scripts used to bootstrap and manage the environment are written in typescript. 

Because the compiled version of the scripts are not stored in source control, you will be required to compile them.

To compile these once, use the command 

    tsc -p ./bootstrap/

It is often convenient to open a separate terminal window and run `tsc` with the `--watch` parameter to continuously compile the scripts as they change. 

    tsc --watch -p ./bootstrap/

### Phase 1 - Prepare the infrastructure for containers

You can then bootstrap for a particular environment with the bootstrap script. For example, to bootstrap the `staging` environment: 

     ./bootstrap/bootstrap.sh staging

See below for how to define an environment. 


### Phase 2 - Step 2 - Upload and Restore Database

??? Profit ??? 

### Phase 2 - Deploy Containers

Deploy containers to an environment with the `compose-environment.sh` script. 

    ./compose/compose-environment.sh ./compose/compose-file.yaml staging

## Environment Definition 

Environments such as "staging" or "production" are defined via a few different files. The environment name like "staging" or "production" below is represented as `ENVIRONMENT`. 

- `./environments/ENVIRONMENT.json` -- a JSON file that maps to `IEnvironmentDefinition_JSON` from the bootstrapper
- `./bootstrap/ENVIRONMENT-inventory.sh` and `./bootstrap/ENVIRONMENT-inventory-no-volumes.sh` -- Ansible dynamic inventory scripts, these funnel through to the `ansible-hosts` node script
- `./secrets/ENVIRONMENT/ssh_volumes/keys` - TODO document this
- `./secrets/ENVIRONMENT/ssh_volumes/user` - TODO document this

## Secrets

Secrets are housed in the `./secrets` directory; this directory is not committed to source control.

There is currently no documentation of which secrets are required for each container. 

***TODO***

## Connect to Docker 

To easily connect to the docker engine for an environment run 

    source <(./bootstrap/dist/container.js print-env staging)

    source <(./bootstrap/dist/container.js print-env production)

This will your current bash session with the environment variables needed to transparently run `docker` commands. 

Validate with `docker info`.
