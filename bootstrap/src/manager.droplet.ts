import { DigitalOceanRunner } from './runner_digital_ocean';

export interface IDroplet {
  id: number,
  name: string,
  memory: number,
  vcpus: number,
  disk: number,
  size_slug: string,
  region: { 
    slug: string,
    name: string
  },
  image: {
    id: number,
    name: string,
    distribution: string
  },
  networks: {
    v4: [
      {
        ip_address: string,
        type: string
      }
    ]
  },
  created_at: string
}

export class DropletManager {

  public getDroplets(): Promise<IDroplet[]> {
    return DigitalOceanRunner.MakeRunner()
      .then((runner) => {
        return runner
            .arg('compute droplet list')
            .arg('-o json')
            .exec();
  
      })
      .then((output) => { 
        return JSON.parse(output) as IDroplet[];
       });
  }

  public getDroplet(name: string): Promise<IDroplet> {
    return this.getDroplets()
      .then((droplets) => droplets.filter((d => d.name === name)))
      .then((droplets) => {
        if (droplets.length <= 0) { return undefined;}
        return droplets[0];
      });
  }

  public createDroplet(name: string): Promise<IDroplet> {
    return DigitalOceanRunner.MakeRunner()
      .then((runner) => {
        return runner
          .arg(`compute droplet create ${name}`)
          .arg(`--enable-private-networking`)
          .arg(`--image fedora-28-x64-atomic`)
          .arg(`--size s-1vcpu-2gb`)
          .arg(`--region nyc3`)
          .arg(`--ssh-keys b2:32:08:e6:3b:9b:17:c8:21:4e:a9:c5:bb:66:56:60`)
          .arg(`--wait`)
          .arg(`-o json`)
          .exec();
      })
      .then((output) => {
        const droplets = JSON.parse(output) as IDroplet[];
        return droplets[0];
      });
  }

  public deleteDroplet(droplet: IDroplet): Promise<void> {
    return DigitalOceanRunner.MakeRunner()
      .then((runner) => {
        console.log(`Deleting droplet ${droplet.name} (${droplet.id})`);
        return runner
          .arg(`compute droplet delete ${droplet.id}`)
          .arg('--force')
          .exec()
      })
      .then(() => {})
  }

  public ipForDroplet(droplet: IDroplet): string {
    if (droplet === undefined) { return undefined; }
    let networks = droplet.networks.v4.filter(n => n.type === 'public');
    return networks.length > 0 ? networks[0].ip_address : undefined;
  }
}