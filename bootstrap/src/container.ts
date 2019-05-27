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
    }, handleCreateSingleContainer)

    .command('create-all <environmentName>', 'create all containers in an environment', (yargs) => {
      return yargs
        .positional('environmentName', {
          type: 'string',
          required: true,
          describe: 'environment to create the containers in'
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

function deleteAndCreateContainer(environment: IEnvironmentDefinition, containerName: string): Promise<IContainer[]> {
  let containerManager = new ContainerManager();
  return containerManager.deleteContainer(environment, containerName)
    .then(() => {
      if (containerName === ContainerManager.TraefikProxyName) {
        return containerManager.createTraefik(environment);
      }
      else {
        return containerManager.createGeneric(environment, containerName);
      }
    });
}

function handleCreateSingleContainer(args: {environmentName: string, containerName: string}): Promise<any> {

  return EnvironmentManager.getEnvironmentDefinition(args.environmentName)
    .then((environment) => deleteAndCreateContainer(environment, args.containerName))
    .then((container) => console.log(container));
}

function handleCreateAllContainers(args: {environmentName: string}): Promise<any> {
  return EnvironmentManager.getEnvironmentDefinition(args.environmentName)
    .then((environment) => {
      let containerManager = new ContainerManager();

      return ContainerManager.getAvailableContainerDefinitions()
        .then((availableContainers) => {
          let lastPromise: Promise<any> = Promise.resolve();
          availableContainers.forEach(c => {
            lastPromise = lastPromise.then(() => deleteAndCreateContainer(environment, c)).then((c) => console.log(c))
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