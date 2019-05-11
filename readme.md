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

### Phase 1 - Step 1 - Create the infrastructure in Digital Ocean 

You can then bootstrap for a particular environment with the bootstrap script. For example, to bootstrap the `staging` environment: 

     ./bootstrap/bootstrap.sh staging

Note that environments are defined in `./bootstrap/ENVIRONMENT.json` files and also have directories in `./secrets`. 

### Phase 2 - Step 2 - Generate the TLS certs for Docker 

Now that a hostname and IP address are available, you need to generate/update the Docker TLS certs:

    ./bootstrap/make-docker-certs.sh staging

Once the certs exist, you can update the remote environment to use them (note that this command uses the `-no-volumes` variant of the inventory script because we can't yet connect to Docker to create volumes): 

    ansible-playbook -i ./bootstrap/ansible/staging-inventory-no-volumes.sh ./bootstrap/ansible/configure-docker-certs.yaml

### Phase 1 - Step 3 - Update Docker Environment 

Configure your local environment to use the TLS certs to talk to Docker 

    source ./secrets/staging/docker_certs/staging.electriclemur.com/source_me.sh

### Phase 2 - Step 1 - Upload Static Files 

Use an Ansible playbook to copy backups of static files from S3 to data volumes in Digital Ocean. Use the appropriate dynamic inventory script for the environment you are bootstrapping. 

    ansible-playbook -i ./bootstrap/ansible/staging-inventory.sh ./bootstrap/ansible/upload-files-playbook.yaml

### Phase 2 - Step 2 - Upload and Restore Database

??? Profit ??? 

## Deploy Containers

Deploy containers to an environment with the `compose-environment.sh` script. 

    ./compose-environment.sh ./compose-file.yaml staging

## Secrets

Secrets are housed in the `./secrets` directory; this directory is not committed to source control.

There is currently no documentation of which secrets are required for each container. 

***TODO***