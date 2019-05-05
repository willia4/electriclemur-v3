#!/usr/bin/env node
import { DockerRunner } from './docker_runner';
import * as yargs from 'yargs';
import * as vol from './volume_manager'

function processArgs() {
  return yargs
    .command('mount-path <volumeType>', 'get the mount path for a volume', (yargs) => {
      return yargs.positional('volumeType', {
        describe: 'volume type',
        type: 'string',
        required: true
      })
    }, handleMountPath)
    
    .command('volume-id <volumeType>', 'get the id for a volume', (yargs) => {
      return yargs.positional('volumeType', {
        describe: 'volume type',
        type: 'string',
        required: true
      })
    }, handleId)

    .argv;
}

function handleMountPath(args: {volumeType: string}): Promise<void> {
  return vol.getOrCreateVolume(args.volumeType)
    .then((volume) => { console.log(volume.Mountpoint); })
}

function handleId(args: {volumeType: string}): Promise<void> {
  return vol.getOrCreateVolume(args.volumeType)
    .then((volume) => { console.log(volume.Name); })
}
processArgs();