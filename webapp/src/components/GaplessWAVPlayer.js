import React from 'react';

/**
 * Attempt to play back successive WAV buffers as gaplessly as
 * possible without adding buffering latency.
 *
 * NB: it doesn't currently appear to be possible to play back WAV
 * gaplessly across all browsers without resorting to hacks like
 * AAC-encoding the PCM buffers and then embedding the AAC track in
 * MP4 fragments along with headless video tracks.  So in other
 * words, "no".
 */
export default class GaplessWAVPlayer extends React.Component {
  audioCtx = null;
  bufferSource = null;
  sourceQ = [ ];

  componentDidMount() {
    this.audioCtx = new AudioContext();
  }

  componentWillUnmount() {
    if (this.bufferSource) {
      this.bufferSource.stop();
    }
    this.audioCtx = null;
    this.bufferSource = null;
    this.sourceQ = [ ];
  }

  appendBuffer(wav) {
    if (!this.audioCtx) {
      console.log('No audio context, refusing to append buffer');
      return;
    }
    // TODO: since this interface is asynchronous, in theory two
    // successive buffers enqueued quickly could finish decoding in
    // the opposite order that decoding begins, and then be swapped in
    // the playback queue.  This seems unlikely though.
    this.audioCtx.decodeAudioData(wav).then((buffer) => {
      // We decode and prepare the next buffer source so that all we
      // have to do is call |source.start()| below when the previous
      // source finishes.  This was found to reduce gap latency.
      // Note, this is the poor man's best-effort gapless playback
      // technique.
      let source = this.audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.audioCtx.destination);
      source.onended = () => {
        this.bufferSource = null;
        this._feedPlayer(null);
      };
      this._feedPlayer(source);
    });
  }

  _feedPlayer(source) {
    if (!this.audioCtx) {
      console.log('No audio context, refusing to play audio source');
      return;
    }
    if (source) {
      this.sourceQ.push(source);
    }
    if (this.bufferSource) {
      return;
    }
    let nextSource = this.sourceQ.shift();
    if (!nextSource) {
      console.log('Played WAV queue, waiting for next source ...');
      return;
    }
    nextSource.start();
    this.bufferSource = source;
  }

  render() {
    return null;
  }
}
