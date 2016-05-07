import invariant from 'assert';
import https from 'https';
import uuid from 'uuid';
import events from 'events';

import createLog from 'silk-log';
const log = createLog('voice');

const clientId = 'silk';
const clientSecret = '110e7213c3cc420ab03dea71fae35a53';
const speechHost = 'speech.platform.bing.com';
const speechUrl = 'https://' + speechHost;

// unique id for this app (can be anyyhing we choose)
let appid = 'D4D52672-91D7-4C74-8AD8-42B1D98141A5';
let appidNoDash = appid.replace(/-/g, '');

// unique id for this instance of this app
let instanceId = uuid();
let instanceIdNoDash = instanceId.replace(/-/g, '');

function urlEncode(obj) {
  let list = [];
  Object.keys(obj).forEach(key => list.push(encodeURIComponent(key) + '=' + encodeURIComponent(obj[key])));
  return list.join('&');
}

let accessToken = null;
function getAccessToken(callback) {
  if (accessToken) {
    log.info(`Returning cached access token`);
    callback(accessToken);
    return;
  }
  let data = urlEncode({
    'grant_type': 'client_credentials',
    'client_id': clientId,
    'client_secret': clientSecret,
    scope: speechUrl,
  });
  let opts = {
    hostname: 'oxford-speech.cloudapp.net',
    port: 443,
    path: '/token/issueToken',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': data.length,
    }
  };
  log.info(`Issuing access token request`);
  let req = https.request(opts, (res) => {
    let json = '';
    res.on('data', chunk => json += chunk);
    res.on('end', () => {
      if (res.statusCode !== 200) {
        throw new Error(json);
      }
      accessToken = JSON.parse(json);
      callback(accessToken);
    });
  });
  req.write(data);
  req.end();
}

export function generateWavHeader(options) {
  const dataSize = options.dataSize || 0;
  const bytesPerSample = options.bytesPerSample || 2;
  const numChannels = options.numChannels || 1;
  const sampleRate = options.sampleRate || 16000;
  const chunkSize = 36 + dataSize; // header size + dataSize
  const byteRate = sampleRate * bytesPerSample * numChannels;
  const blockAlign = numChannels * bytesPerSample;
  const bitsPerSample = bytesPerSample * 8;

  let hdr = new Buffer(44);
  hdr.writeUInt32BE(0x52494646, 0);          // "RIFF"
  hdr.writeUInt32LE(chunkSize, 4);           // chunk size
  hdr.writeUInt32BE(0x57415645, 8);          // "WAVE"
  hdr.writeUInt32BE(0x666d7420, 12);         // subchunk1 id- "fmt"
  hdr.writeUInt32LE(16, 16);                 // subchunk1 size
  hdr.writeUInt16LE(1, 20);                  // audio format
  hdr.writeUInt16LE(numChannels, 22);        // num channels
  hdr.writeUInt32LE(sampleRate, 24);         // sample rate
  hdr.writeUInt32LE(byteRate, 28);           // byte rate
  hdr.writeUInt16LE(blockAlign, 32);         // block align
  hdr.writeUInt16LE(bitsPerSample, 34);      // bits per sample
  hdr.writeUInt32BE(0x64617461, 36);         // subchunk2 id - "data"
  hdr.writeUInt32LE(dataSize, 40);           // data size

  return hdr;
}

class TextToSpeech extends events.EventEmitter {
  constructor(text) {
    super();

    this._req = null;
    this._finished = false;
    this._auth = null;
    getAccessToken(auth => this._startRequest(text, auth));
  }

  _startRequest(text, auth) {
    log.debug('text-to-speech: Got auth token');
    if (this._finished) {
      log.debug('text-to-speech: Request aleady finished');
      return;
    }

    let postData = `<speak version='1.0' xml:lang='en-US'><voice xml:lang='en-US' xml:gender='Female' name='Microsoft Server Speech Text to Speech Voice (en-US, ZiraRUS)'>${text}</voice></speak>`;

    let opts = {
      hostname: speechHost,
      port: 443,
      path: '/synthesize',
      method: 'POST',
      headers: {
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'raw-16khz-16bit-mono-pcm',
        'Authorization': 'Bearer ' + auth.access_token,
        'X-Search-AppId': appidNoDash,
        'X-Search-ClientID': instanceIdNoDash,
        'User-Agent': 'silk',
        'Content-Length': postData.length,
      }
    };

    log.info('text-to-speech: Issuing new request');
    log.debug(`  postData: ${JSON.stringify(opts)}`);
    this._req = https.request(opts, res => {
      res.on('data', chunk => {
        log.debug('text-to-speech: Response data chunk', chunk.length);
        this.emit('data', chunk);
      });
      res.on('end', () => {
        log.info(`text-to-speech: Response complete ${res.statusCode}`);
        if (res.statusCode !== 200) {
          this.emit('error', res.statusCode);
        } else {
          this.emit('end');
        }
      });
    });

    this._req.write(postData);
    this._req.end();
  }

  get audioParams() {
    return {
      bytesPerSample: 2,
      encoding: 'signed-integer',
      endian: 'little',
      numChannels: 1,
      sampleRate: 16000,
    };
  }
}

class SpeechToText {
  constructor(audioParams, cb) {
    this._audioParams = audioParams;
    this._cb = cb;
    this._req = null;
    this._finished = false;
    this._auth = null;
    this._pcmSamples = new Buffer(0);
    getAccessToken(auth => this._startRequest(auth));
  }

  _startRequest(auth) {
    log.debug('speech-to-text: Got auth token');
    if (this._finished) {
      log.debug('speech-to-text: Request aleady finished');
      return;
    }

    let query = urlEncode({
      version: '3.0',
      requestid: uuid(), // per request
      appid: appid,
      format: 'json',
      locale: 'en-US',
      'device.os': 'Silk OS',
      scenarios: 'ulm',
      instanceid: instanceId,
      'result.profanitymarkup': 0, // Fuck marking up profanity
    });
    let opts = {
      hostname: speechHost,
      port: 443,
      path: '/recognize/query?' + query,
      method: 'POST',
      headers: {
        'Content-type': `audio/wav; samplerate=${this._audioParams.sampleRate}`,
        //'Content-Length' : wav.length,
        'Authorization': 'Bearer ' + auth.access_token,
      }
    };
    log.info('speech-to-text: Issuing new request');
    this._req = https.request(opts, res => {
      let json = '';
      res.on('data', chunk => {
        log.debug('speech-to-text: Response data chunk', chunk.length);
        json += chunk;
      });
      res.on('end', () => {
        log.info(`speech-to-text: Response complete ${res.statusCode}`);
        log.debug(`  Response: ${json}`);
        if (res.statusCode !== 200) {
          this._cb(new Error(json));
        } else {
          this._cb(null, JSON.parse(json));
        }
      });
    });

    // Use large length since we don't know how much PCM data will be coming in.
    let hdr = generateWavHeader(
        Object.assign({}, this._audioParams, {dataSize: 0x6FFFFFFF}));

    log.info('speech-to-text: Sending wav header');
    this._req.write(hdr);
    if (this._pcmSamples.length > 0) {
      log.info(`speech-to-text: Sending queued PCM data: ${this._pcmSamples.length} bytes`);
      this._req.write(this._pcmSamples);
    }
  }

  write(pcmData) {
    invariant(!this._finished);
    if (!this._req) {
      log.info(`speech-to-text: Queuing PCM data: ${pcmData.length} bytes`);
      this._pcmSamples = Buffer.concat([this._pcmSamples, pcmData]); // *shudder*
    } else {
      log.debug(`speech-to-text: Writing PCM data: ${pcmData.length} bytes`);
      this._req.write(pcmData);
    }
  }

  finish() {
    invariant(!this._finished);
    this._finished = true;
    if (!this._req) {
      let error = 'speech-to-text: Unable to get access token in time, request dropped';
      log.error(error);
      this._cb(new Error(error));
      return;
    }
    log.info('speech-to-text: Finishing request');
    this._req.end();
  }
}

export function createSpeechToText(audioParams, cb) {
  log.info('new SpeechToText');
  return new SpeechToText(audioParams, cb);
}

export function createTextToSpeech(text) {
  log.info('new TextToSpeech');
  return new TextToSpeech(text);
}
