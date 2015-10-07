import gutil from 'gulp-util';
import { spawn } from 'mz/child_process';

export default function printExec(cmd) {
  return new Promise((accept, reject) => {
    let proc = spawn('/bin/bash', ['-c', cmd], {
      stdio: 'inherit'
    });
    gutil.log('$ ', cmd);
    proc.once('error', reject);
    proc.once('exit', (code) => {
      if (code !== 0) {
        proc.emit('error', new Error(`
          ${cmd} did not exit with zero
        `));
        return;
      }
      accept();
    });
  });
}
