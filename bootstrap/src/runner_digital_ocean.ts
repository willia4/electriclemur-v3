import { RunnerBase } from './runner_base';

export class DigitalOceanRunner extends RunnerBase {
  static MakeRunner(): Promise<DigitalOceanRunner> {
    return Promise.resolve(new DigitalOceanRunner('/home/willia4/bin/doctl'));
  }
}