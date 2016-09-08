/**
 * @flow
 */

import createLog from 'silk-log/device';
import {call, take} from 'redux-saga/effects';
import invariant from 'assert';
import type {Environment} from '../environment';
import type {Entities, ConfigDeviceMic} from 'silk-dialog-engine';
import wav from 'wav';
import {PosKeywordUploadOperation, getOutboxInstance} from 'silk-outbox';
import {BufferReadable} from 'silk-streams';

const log = createLog(`script-keyword`);
const outbox = getOutboxInstance();

const WAV_HEADER_CHUNK_SIZE = 4;
const WAV_HEADER_SUBCHUNK2_SIZE = 40;
const MAX_COUNT = 25;
const done = ` You are all done`;

/**
 * Save utterance on the cloud
 */
function saveUtterance(utterance: Buffer, micConfig: ConfigDeviceMic): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!utterance) {
      reject(new Error(`Invalid utterance received`));
      return;
    }
    let wavData = new Buffer(0);
    let writer = new wav.Writer({
      sampleRate: micConfig.sampleRate,
      channels: micConfig.numChannels,
      bitDepth: micConfig.bytesPerSample * 8,
    });
    writer.on('data', samples => {
      wavData = Buffer.concat([wavData, samples]);
    });
    writer.on('header', header => {
      // Overwrite the wav data length with the correct header information
      let size = header.readInt32LE(WAV_HEADER_SUBCHUNK2_SIZE);
      wavData.writeInt32LE(36 + size, WAV_HEADER_CHUNK_SIZE);
      wavData.writeInt32LE(size, WAV_HEADER_SUBCHUNK2_SIZE);

      let op = new PosKeywordUploadOperation({
        size: wavData.length,
        metadata: {
          metaType: PosKeywordUploadOperation.META_TYPE,
          startUTC: Date.now(),
        },
      });
      outbox.addToQueue(op, new BufferReadable(wavData));
      resolve();
      return;
    });
    writer.on('error', err => {
      reject(err);
    });
    writer.write(utterance);
    writer.end();
  });
}

function* queryKeyword(
  environment: Environment,
  count: number,
): Generator<Object, ?number, any> {
  const {dialogEngine, micChannel, speak} = environment;
  let micConfig = dialogEngine.enableUtterance(true);

  for (let i = 0; i < count; i++) {
    const event = yield take(micChannel);
    invariant(event);

    const {intent, utterance} = event;
    if (intent === 'cancel') {
      yield call(speak, `Canceled recording keywords`, `idle`);
      break;
    }

    let text = `Count ${i + 1} of ${count}.`;
    if (i < (count - 1)) {
      try {
        yield call(saveUtterance, utterance, micConfig);
      } catch (err) {
        yield call(speak, `Sorry, I am unable to save the utterance. Canceling.`, `idle`);
        return;
      }
      yield call(speak, text, `waiting`);
    } else {
      yield call(speak, text + done, `idle`); // All done
    }
  }
  dialogEngine.enableUtterance(false);
}

export function* recordKeyword(
  environment: Environment,
  entities: Entities
): Generator<Object, void, any> {
  invariant(environment);

  const {speak} = environment;
  invariant(speak);

  let countEntity = null;
  for (let entity of entities) {
    if (entity.type === 'builtin.number') {
      countEntity = entity.entity;
      break;
    }
  }

  let count = 10; // Default
  if (!countEntity || isNaN(countEntity)) {
    log.debug('Count: ', countEntity);
    yield call(speak, `Invalid count provided, defaulting to count of ${count}`);
  } else {
    count = parseInt(countEntity);
  }

  if ((count < 1) || (count > MAX_COUNT)) {
    yield call(speak, `Please make sure that count is between 1 and ${MAX_COUNT}`, `idle`);
    return;
  }

  yield call(speak, `Start speaking the keyword. You can speak cancel anytime to cancel the session`,
      `waiting`);
  yield call(queryKeyword, environment, count);
}
