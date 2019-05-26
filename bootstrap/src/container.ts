#!/usr/bin/env node
import { ContainerManager } from './manager.container';

import * as yargs from 'yargs';
import { IEnvironmentDefinition, EnvironmentManager } from './manager.environment';
import { DockerRunner } from './runner_docker';

function processArgs() {
  return yargs
    .command('create <environmentName> <containerName>', 'create a container in an environment', (yargs) => {
      return yargs
        .positional('environmentName', {
          type: 'string',
          required: true,
          describe: 'environment to create the container in'
        })
        .positional('containerName', {
          type: 'string',
          required: true,
          describe: 'container to create in the environment'
        })
    }, handleCreate)

    .command('print-env <environmentName>', 'print environment variables to source', (yargs) => {
      return yargs
        .positional('environmentName', {
          type: 'string',
          required: true,
          describe: 'environment to create the container in'
        })
    }, handlePrintEnvironment)

    .argv;
}

function handleCreate(args: {environmentName: string, containerName: string}): Promise<any> {

  return EnvironmentManager.getEnvironmentDefinition(args.environmentName)
    .then((environment) => {
      let containerManager = new ContainerManager();

      return containerManager.deleteContainer(environment, args.containerName)
        .then(() => {
          if (args.containerName === ContainerManager.TraefikProxyName) {
              return containerManager.createTraefik(environment);
          }
          else {
            return containerManager.createGeneric(environment, args.containerName);
          }
        });      
    })
    .then((container) => console.log(container));
}

function handlePrintEnvironment(args :{environmentName: string}): Promise<any> {
  return EnvironmentManager.getEnvironmentDefinition(args.environmentName)
    .then((env) => DockerRunner.GetDockerEnvironmentVariables(env))
    .then((env) => {
      for(let k in env) {
        if (env.hasOwnProperty(k)) {
          console.log(`export ${k}="${env[k]}"`)
        }
      }
    });
}

processArgs();