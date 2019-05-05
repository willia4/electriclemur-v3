# Electric Lemur 3.0

## Introduction

For Electric Lemur 3.0, the Electric Lemur family of sites will run on a single node hosted by Digital Ocean. 

The web sites will run as docker containers, orchestrated by docker-compose. 

The code in this repository is capable of initializing and maintaining this node. 

## Bootstrap 

To create a node in Digital Ocean, you will need to compile the bootstrap script with 

    tsc -p ./bootstrap/

You can then bootstrap for a particular environment with the appropriate script

     ./bootstrap/dist/bootstrap_staging.js

## Deploy Containers

Deploy containers to an environment with the `compose-environment.sh` script. 

    ./compose-environment.sh ./compose-file.yaml staging

## Secrets

Secrets are housed in the `./secrets` directory; this directory is not committed to source control.

There is currently no documentation of which secrets are required for each container. 

***TODO***