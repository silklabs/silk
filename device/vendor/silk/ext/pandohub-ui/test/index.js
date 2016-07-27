/**
 * @flow
 */

import { Nightlight, Ring } from '../lib/leds';
import createLog from 'silk-log/device';
import { sleep } from 'silk-async-utils';
import lights from 'silk-lights';
const log = createLog('main');

log.info('led test');

function handleError(type, err) {
  log.error(type, err.stack || err);
}

process.on('uncaughtException',
           (err) => handleError('uncaughtException', err));

process.on('unhandledRejection',
           (err) => handleError('unhandledRejection', err));

async function nightlightLoop(nightlight) {

  log.info('userColor yellow 100%');
  lights.get('nightlight').set(lights.YELLOW);
  nightlight.userColor(255);
  await sleep(1000);

  log.info('userColor red 50%');
  lights.get('nightlight').set(lights.RED);
  nightlight.userColor(128);
  await sleep(1000);

  log.info('userColor green 100%');
  lights.get('nightlight').set(lights.GREEN);
  nightlight.userColor(255);
  await sleep(1000);

  log.info('userColor 0%');
  nightlight.userColor(0);
  await sleep(1000);

  log.info('blueWithGlow');
  nightlight.blueWithGlow();
  await sleep(5000);

  log.info('orange');
  nightlight.orange();
  await sleep(1000);

  log.info('blue');
  nightlight.blue();
  await sleep(1000);
}

async function ringLoop(ring) {
  log.info('listening');
  await ring.listening();
  await sleep(1000);

  log.info('unconfigured');
  await ring.unconfigured();
  await sleep(1000);

  log.info('unconfiguredPing');
  ring.unconfiguredPing();
  await sleep(2000);

  log.info('configuring');
  ring.configuring();
  await sleep(1000);

  log.info('initializing');
  await ring.initializing();
  await sleep(1000);

  log.info('online');
  ring.online();
  await sleep(1000);

  log.info('silent');
  await ring.silent();
  await sleep(1000);

  log.info('mute');
  await ring.mute();
  await sleep(1000);

  log.info('listening');
  await ring.listening();
  await sleep(1000);

  log.info('processing');
  await ring.processing();
  await sleep(1000);

  log.info('speaking');
  await ring.speaking();
  await sleep(1000);

  log.info('speakingError');
  await ring.speakingError();
  await sleep(1000);

  log.info('finishedDialog');
  await ring.finishedDialog();
  await sleep(1000);

  for (let i = 0; i <= 12; i++) {
    log.info('volume', i);
    await ring.volume(i);
    await sleep(1000);
  }
  for (let i = 11; i >= 0; i--) {
    await ring.volume(i);
    await sleep(1000);
  }
}

async function main() {
  try {
    let ring = await Ring.create();
    let nightlight = await Nightlight.create();

    while (true) { //eslint-disable-line no-constant-condition
      await Promise.all([
        nightlightLoop(nightlight),
        ringLoop(ring),
      ]);
    }
  } catch (e) {
    log.error(e.stack || e);
  }
}
main();

