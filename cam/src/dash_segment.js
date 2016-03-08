/**
 * A few simple helpers for extracting values from MP4 files
 *
 * @flow
 */

import invariant from 'assert';

export type SegmentInfo = {
  videoOffset: number;
  durationTime: number;
  mute: boolean;
};

type SegmentMetadata = {
  seqnoOffset: number;
  presentationTimeOffset: number;
  videoDecodeTimeOffset: number;
  audioDecodeTimeOffset: number;
  mute: boolean;
};

type Mp4Box = {
  fourcc: string;
  size: number;
  offset: number;
};

// Each MP4 box contains:
//   - boxSize   (4 bytes)
//   - fourcc    (4 bytes)
//   - box specific data (boxSize - 8 bytes)
//
// A box can contain box specific data or more boxes
const BOX_HDR_SIZE = 8;

function readFourcc(data: DataView, offset: number): string {
  let fourcc = '';
  for (let i = 0; i < 4; ++i) {
    fourcc += String.fromCharCode(data.getUint8(offset + i));
  }
  return fourcc;
}

function findNextBox(data: DataView, box: Mp4Box): Mp4Box {
  let offset = box.offset + box.size;
  let size = data.getInt32(offset);
  let fourcc = readFourcc(data, offset + 4);
  return {offset, size, fourcc};
}

function openBox(data: DataView, box: Mp4Box): Mp4Box {
  return findNextBox(data, {offset: box.offset + BOX_HDR_SIZE, size: 0, fourcc: ''});
}

function findBoxByFourcc(
  data: DataView,
  fourcc: string,
  box: Mp4Box = {fourcc: '', size: 0, offset: 0}
): Mp4Box {
  while (box.fourcc !== fourcc) {
    box = findNextBox(data, box);
  }
  return box;
}

function readMetadata(data: DataView, freeBox: Mp4Box): SegmentMetadata {
  let box = openBox(data, freeBox);
  invariant(box.fourcc === 'Xmta');

  let metadata = {};
  let pos = box.offset + BOX_HDR_SIZE;
  pos += 4;               // version and flags (we don't care yet)
  metadata.seqnoOffset = data.getInt32(pos);
  pos += 4;
  metadata.presentationTimeOffset = data.getInt32(pos);
  pos += 4;
  metadata.videoDecodeTimeOffset = data.getInt32(pos);
  pos += 4;
  metadata.audioDecodeTimeOffset = data.getInt32(pos);
  pos += 4;
  metadata.mute = !!data.getInt32(pos);
  pos += 4;

  return metadata;
}

export function rewriteSegment(
  data: DataView,
  seqno: number,
  videoStartTime: number,
  audioStartTime: number
): SegmentInfo {
  // The 'styp' box indicates the beginning of the actual video
  // segment, so find the 'free' box after the 'styp' box to read the
  // segment's metadata.
  const stypBox = findBoxByFourcc(data, 'styp');
  const freeBox = findBoxByFourcc(data, 'free', stypBox);
  const metadata = readMetadata(data, freeBox);

  invariant('?seq' === readFourcc(data, metadata.seqnoOffset));
  // XXX doesn't matter in chrome
  data.setInt32(metadata.seqnoOffset, seqno);

  const videoDecodeTime = videoStartTime + data.getInt32(metadata.videoDecodeTimeOffset);
  const audioDecodeTime = audioStartTime + data.getInt32(metadata.audioDecodeTimeOffset);
  invariant('?prs' === readFourcc(data, metadata.presentationTimeOffset));
  // XXX maybe doesn't matter in chrome
  data.setInt32(metadata.presentationTimeOffset, videoDecodeTime);
  data.setInt32(metadata.videoDecodeTimeOffset, videoDecodeTime);
  data.setInt32(metadata.audioDecodeTimeOffset, audioDecodeTime);

  // Duration is 16 bytes after earliest_presentation_time in "sidx".
  const durationTime = data.getInt32(metadata.presentationTimeOffset + 16);

  return {
    videoOffset: stypBox.offset,
    durationTime,
    mute: metadata.mute,
  };
}
