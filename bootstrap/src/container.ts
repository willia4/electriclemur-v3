#!/usr/bin/env node
import { ContainerManager, IContainer } from './manager.container';

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
        .option('verbose', {
          type: 'boolean',
          default: false
        })
    }, handleCreateSingleContainer)

    .command('create-all <environmentName>', 'create all containers in an environment', (yargs) => {
      return yargs
        .positional('environmentName', {
          type: 'string',
          required: true,
          describe: 'environment to create the containers in'
        })
        .option('verbose', {
          type: 'boolean',
          default: false
        })
    }, handleCreateAllContainers)

    .command('print-env <environmentName>', 'print environment variables to source', (yargs) => {
      return yargs
        .positional('environmentName', {
          type: 'string',
          required: true,
          describe: 'environment to connect Docker to'
        })
    }, handlePrintEnvironment)

    .argv;
}

function deleteAndCreateContainer(environment: IEnvironmentDefinition, containerName: string, verbose: boolean): Promise<IContainer[]> {
  let containerManager = new ContainerManager();
  return containerManager.deleteContainer(environment, containerName, verbose)
    .then(() => {
      if (containerName === ContainerManager.TraefikProxyName) {
        return containerManager.createTraefik(environment, verbose);
      }
      else {
        return containerManager.createGeneric(environment, containerName, verbose);
      }
    });
}

function handleCreateSingleContainer(args: {environmentName: string, containerName: string, verbose: boolean}): Promise<any> {

  return EnvironmentManager.getEnvironmentDefinition(args.environmentName)
    .then((environment) => deleteAndCreateContainer(environment, args.containerName, args.verbose))
    .then((container) => console.log(container));
}

function handleCreateAllContainers(args: {environmentName: string, verbose: boolean}): Promise<any> {
  return EnvironmentManager.getEnvironmentDefinition(args.environmentName)
    .then((environment) => {
      let containerManager = new ContainerManager();

      let lastPromise: Promise<any> = containerManager.deleteContainer(environment, ContainerManager.TraefikProxyName, args.verbose)
        .then(() => containerManager.createTraefik(environment, args.verbose));

      return ContainerManager.getAvailableContainerDefinitions(args.verbose)
        .then((availableContainers) => {

          availableContainers.forEach(c => {
            lastPromise = lastPromise.then(() => deleteAndCreateContainer(environment, c, args.verbose)).then((c) => console.log(c))
          });
          
          return lastPromise;
        });
    })
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