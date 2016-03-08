/**
 * @flow
 */

import assert from 'assert';
import config from 'silk-config';

export type DashSegmentState = {
  seqno: number;
  startTime: number;
};

type Box = {
  fourcc: string;
  size: number;
  offset: number;
};

type Metadata = {
  seqnoOffset: number;
  presentationTimeOffset: number;
  videoDecodeTimeOffset: number;
  audioDecodeTimeOffset: number;
  mute: boolean;
};

type SegmentInfo = {
  mute: boolean;
};

// NB: these values are defined in the init header.  While the init
// header is hard coded, so are these constants for convenience.  If
// we ever support multiple init header types with different sample
// rates, then we'll want to read these constants from the header.
const AUDIO_TICKS_PER_SEC = config.deviceMic.sampleRate;
const VIDEO_TICKS_PER_SEC = 90000; // libstagefright default

// Each MP4 box contains:
//   - boxSize   (4 bytes)
//   - fourcc    (4 bytes)
//   - box specific data (boxSize - 8 bytes)
//
// A box can contain box specific data or more boxes
const BOX_HDR_SIZE = 8;

function readFourcc(buf: Buffer, offset: number): string {
  let fourcc = '';
  for (let i = 0; i < 4; ++i) {
    fourcc += String.fromCharCode(buf[offset + i]);
  }
  return fourcc;
}

function findNextBox(mp4, box: Box = { fourcc: '', size: 0, offset: 0 }): Box {
  let pos = box.offset = box.offset + box.size;
  box.size = mp4.readInt32BE(pos);
  pos += 4;
  box.fourcc = readFourcc(mp4, pos);
  return box;
}

function readMetadataBox(m4s: Buffer): Metadata {
  let metadata = {};
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
  metadata.seqnoOffset = m4s.readInt32BE(pos);
  pos += 4;
  metadata.presentationTimeOffset = m4s.readInt32BE(pos);
  pos += 4;
  metadata.videoDecodeTimeOffset = m4s.readInt32BE(pos);
  pos += 4;
  metadata.audioDecodeTimeOffset = m4s.readInt32BE(pos);
  pos += 4;
  metadata.mute = !!m4s.readInt32BE(pos);
  pos += 4;

  return metadata;
}

/**
 * Prepare an MPEG-DASH segment for playback e.g. via MSE API in the browser.
 *
 * The buffer is modified in-place.
 */
export default function prepareSegment(
  m4s: Buffer,
  state: DashSegmentState
): SegmentInfo {
  let seqno = state.seqno;
  let startTime = state.startTime;

  let metadata = readMetadataBox(m4s);
  // Duration is 16 bytes after earliest_presentation_time in "sidx".
  let durationTicks = m4s.readInt32BE(metadata.presentationTimeOffset + 16);

  assert.equal('?seq', readFourcc(m4s, metadata.seqnoOffset));
  // XXX doesn't matter in chrome
  m4s.writeInt32BE(seqno, metadata.seqnoOffset);

  let videoDecodeTime = startTime + m4s.readInt32BE(metadata.videoDecodeTimeOffset);
  assert.equal('?prs', readFourcc(m4s, metadata.presentationTimeOffset));
  // XXX maybe doesn't matter in chrome
  m4s.writeInt32BE(videoDecodeTime, metadata.presentationTimeOffset);
  m4s.writeInt32BE(videoDecodeTime, metadata.videoDecodeTimeOffset);

  // TODO: get timeScales from init header
  let startTimeDelta = (startTime * AUDIO_TICKS_PER_SEC / VIDEO_TICKS_PER_SEC) | 0;
  let audioDecodeTime = startTimeDelta + m4s.readInt32BE(metadata.audioDecodeTimeOffset);
  m4s.writeInt32BE(audioDecodeTime, metadata.audioDecodeTimeOffset);

  state.seqno += 1;
  state.startTime += durationTicks;

  return {mute: metadata.mute};
}
