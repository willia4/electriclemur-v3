import { RunnerBase } from './runner_base';

export class DORunner extends RunnerBase {
  static MakeRunner(): Promise<DORunner> {
    return Promise.resolve(new DORunner('/home/willia4/bin/doctl'));
  }
}