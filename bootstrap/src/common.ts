
import * as fs from 'fs';

export function delay(milliseconds: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    setTimeout(() => {
      resolve();
    }, milliseconds);
  });
}

export function readFileAsync(fullPath: string): Promise<string> {
  return (new Promise<string>((resolve ,reject) => {
    fs.readFile(fullPath, { encoding: "utf8" }, (err, contents) => {
      if (err) {
        return reject(err);
      }
      return resolve(contents);
    });
  }))
}

export function listFilesAsync(fullPath: string): Promise<string[]> {
  return new Promise<string[]>((resolve, reject) => {
    fs.readdir(fullPath, (err, files) => {
      if (err) { 
        return reject(err);
      }
      return resolve(files);
    })
  });
}