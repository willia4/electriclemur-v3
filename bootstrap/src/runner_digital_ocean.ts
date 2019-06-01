import { RunnerBase } from './runner_base';

export class DigitalOceanRunner extends RunnerBase {
  static MakeRunner(verbose: boolean = false): Promise<DigitalOceanRunner> {
    let runner = new DigitalOceanRunner('/home/willia4/bin/doctl');
    runner.echoOutput = verbose;

    return Promise.resolve(runner);
  }
}