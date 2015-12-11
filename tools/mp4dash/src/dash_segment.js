// Copied almost verbatimly from
// https://github.com/silklabs/silk-webapp/blob/master/src/components/CameraVideoMSE.js

import assert from 'assert';
import createLog from 'log';

const log = createLog('dash_segment');

// NB: these values are defined in the init header.  While the init
// header is hard coded, so are these constants for convenience.  If
// we ever support multiple init header types with different sample
// rates, then we'll want to read these constants from the header.
const AUDIO_TICKS_PER_SEC = 8000;  // 8KHz = audio sampling rate
const VIDEO_TICKS_PER_SEC = 90000; // libstagefright default

const BOX_HDR_SIZE = 8;

function readFourcc(buf, offset) {
  let fourcc = '';
  for (let i = 0; i < 4; ++i) {
    fourcc += String.fromCharCode(buf[offset + i]);
  }
  return fourcc;
}

function findNextBox(mp4, box = { fourcc: '', size: 0, offset: 0 }) {
  let pos = box.offset = box.offset + box.size;
  box.size = mp4.readInt32BE(pos);
  pos += 4;
  box.fourcc = readFourcc(mp4, pos);
  return box;
}

function findMetadataBox(m4s) {
  let offsets = { };
  // Find the "free" box where our metadata is stashed in.
  let box = findNextBox(m4s);
  while (box.fourcc !== 'free') {
    box = findNextBox(m4s, box);
  }

  // Check that we found the right box.
  box.offset += BOX_HDR_SIZE;
  box.size = 0;
  box = findNextBox(m4s, box);
  assert.equal(box.fourcc, 'Xmta');

  let pos = box.offset + BOX_HDR_SIZE;
  pos += 4;               // version and flags (we don't care yet)
  offsets.seqno = m4s.readInt32BE(pos);
  pos += 4;
  offsets.presentationTime = m4s.readInt32BE(pos);
  pos += 4;
  offsets.videoDecodeTime = m4s.readInt32BE(pos);
  pos += 4;
  offsets.audioDecodeTime = m4s.readInt32BE(pos);
  pos += 4;
  let mute = m4s.readInt32BE(pos);
  pos += 4;
  return {offsets, mute};
}

export default function prepareSegment(m4s: Buffer, state) {
  let seqno = state.seqno;
  let startTime = state.startTime;

  let {offsets, mute} = findMetadataBox(m4s);
  // Duration is 16 bytes after earliest_presentation_time in "sidx".
  let durationTicks = m4s.readInt32BE(offsets.presentationTime + 16);

  assert.equal('?seq', readFourcc(m4s, offsets.seqno));
  // XXX doesn't matter in chrome
  m4s.writeInt32BE(seqno, offsets.seqno);

  let videoDecodeTime = startTime + m4s.readInt32BE(offsets.videoDecodeTime);
  assert.equal('?prs', readFourcc(m4s, offsets.presentationTime));
  // XXX maybe doesn't matter in chrome
  m4s.writeInt32BE(videoDecodeTime, offsets.presentationTime);
  m4s.writeInt32BE(videoDecodeTime, offsets.videoDecodeTime);

  // TODO: get timeScales from init header
  let startTimeDelta =
        (startTime * AUDIO_TICKS_PER_SEC / VIDEO_TICKS_PER_SEC) | 0;
  let audioDecodeTime =
        startTimeDelta + m4s.readInt32BE(offsets.audioDecodeTime);
  m4s.writeInt32BE(audioDecodeTime, offsets.audioDecodeTime);

  ++state.seqno;
  state.startTime += durationTicks;

  return m4s;
}
