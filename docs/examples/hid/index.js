/*
 * @noflow
 */

import makeLog from 'silk-log';

import sleep from './sleep';
import device from './device';
const log = makeLog('main');

import {Keyboard, Mouse} from './hid';

device.init();

async function mouseDemo() {
  log.info('== mouse demo ==');
  const mouse = await Mouse.create();

  log.info('Right mouse button click');
  await mouse.click('right');
  await sleep(1000);

  log.info('Left mouse button click');
  await mouse.click();

  log.info('Moving mouse...');
  for (let i = 0; i < 30; i++) {
    await mouse.move(10, 10);
    await sleep(10);
  }

  log.info('Dragging left mouse button...');
  await mouse.press();
  for (let i = 0; i < 30; i++) {
    await mouse.move(-10, -10);
    await sleep(10);
  }
  await mouse.release();
}

async function keyboardDemo() {
  log.info('== keyboard demo ==');

  const keyboard = await Keyboard.create();

  await keyboard.press('left-shift');
  await keyboard.press('h');
  await sleep(50);
  await keyboard.release('h');
  await keyboard.release('left-shift');

  await keyboard.press('i');
  await sleep(50);
  await keyboard.release('i');

  await keyboard.press('left-shift');
  await keyboard.press('1');
  await sleep(1000);
  await keyboard.release('1');
  await keyboard.release('left-shift');
}


async function main() {
  await keyboardDemo();
  await mouseDemo();
}

main();
