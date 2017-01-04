/**
 * Because we ascend upwards in the cwd testing inside of the project itself is
 * counter productive so we have these tools to stage fixtures inside of tmp.
 *
 * @flow
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import {exec} from 'mz/child_process';

import createDebug from 'debug';

const FIXTURES = path.join(__dirname, 'fixtures');
const debug = createDebug('silk-cli:test:fixture');

export async function create(): Promise<string> {
  let tmp = fs.realpathSync(os.tmpdir());
  let directory = path.join(
    tmp,
    `silk-cli-tests-${process.pid}`
  );
  debug('staging fixtures', directory);

  if (fs.existsSync(directory)) {
    await exec(`rm -rf ${directory}`);
  }

  await exec(`cp -R ${FIXTURES} ${directory}`);
  return directory;
}

export async function destroy(path: string): Promise<void> {
  debug('removing', path);
  await exec(`rm -rf ${path}`);
}
