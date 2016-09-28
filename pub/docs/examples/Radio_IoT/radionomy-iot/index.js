'use strict';

const Input = require('silk-input').default;
const Speaker = require('silk-speaker').default;
const icecast = require('icecast');
const lame = require('lame');
const wifi = require('silk-wifi').default;

require('./device').init();

const speaker = new Speaker();
let speakerVolume = 0.5;
speaker.setVolume(speakerVolume);

wifi.once('online', () => {
  const url = 'http://listen.radionomy.com/mozart';

  console.log('Connecting to', url);
  icecast.get(url, (res) => {
    console.log(res.headers);

    if (res.headers['content-type'] != 'audio/mpeg') {
      console.error('not an mpeg stream');
      return;
    }

    res.on('metadata', function(metadata) {
      const parsed = icecast.parse(metadata);
      console.log(parsed);
    });

    res.pipe(new lame.Decoder()).pipe(speaker);
  });
});

let input = new Input();
input.on('down', e => {
  switch (e.keyId) {
    case 'volumeup':
      speakerVolume = Math.min(speakerVolume + 0.1, 1);
      break;
    case 'volumedown':
      speakerVolume = Math.max(0, speakerVolume - 0.1);
      break;
    default:
      return;
  }
  console.log('Speaker volume:', speakerVolume);
  speaker.setVolume(speakerVolume);
});
