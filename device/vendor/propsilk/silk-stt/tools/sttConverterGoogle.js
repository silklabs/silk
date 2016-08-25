/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 */

// Prequisites: https://github.com/GoogleCloudPlatform/nodejs-docs-samples#prerequisites

'use strict';

import { default as createLog, configureLog } from 'silk-log';

import fs from 'fs';
import path from 'path';
import grpc from 'grpc';
import googleProtoFiles from 'google-proto-files';
import googleAuth from 'google-auto-auth';
import {Transform} from 'stream';
import wav from 'wav';

configureLog('*');
const log = createLog('sttConverter');

let PROTO_ROOT_DIR = googleProtoFiles('..');

let protoDescriptor = grpc.load({
  root: PROTO_ROOT_DIR,
  file: path.relative(PROTO_ROOT_DIR, googleProtoFiles.speech.v1beta1),
}, 'proto', {
  binaryAsBase64: true,
  convertFieldsToCamelCase: true,
});
let speechProto = protoDescriptor.google.cloud.speech.v1beta1;

function getSpeechService(host) {
  return new Promise((resolve, reject) => {
    let googleAuthClient = googleAuth({
      scopes: [
        'https://www.googleapis.com/auth/cloud-platform',
      ],
    });

    googleAuthClient.getAuthClient((err, authClient) => {
      if (err) {
        return reject(err);
      }

      let credentials = grpc.credentials.combineChannelCredentials(
        grpc.credentials.createSsl(),
        grpc.credentials.createFromGoogleCredential(authClient)
      );

      log.info('Loading speech service...');
      let stub = new speechProto.Speech(host, credentials);
      return resolve(stub);
    });
  });
}

let speechServicePromise = getSpeechService('speech.googleapis.com');
export default function main (inputFile) {
  return speechServicePromise.then(speechService => {
    return new Promise((resolve, reject) => {
      let responses = [];
      let call = speechService.streamingRecognize();

      // Listen for various responses
      call.on('error', (err) => reject(err));
      call.on('data', function (recognizeResponse) {
        if (recognizeResponse) {
          // log.info(JSON.stringify(recognizeResponse, null, 2));
          if (recognizeResponse.results && recognizeResponse.results.length) {
            responses.push(recognizeResponse);
          }
        }
      });
      call.on('end', function () {
        resolve(responses);
      });

      // Write the initial recognize reqeust
      call.write({
        streamingConfig: {
          config: {
            encoding: 'LINEAR16',
            sampleRate: 16000,
          },
          interimResults: false,
          singleUtterance: false,
        },
      });

      let toRecognizeRequest = new Transform({ objectMode: true });
      toRecognizeRequest._transform = function (chunk, encoding, done) {
        done(null, {
          audioContent: chunk,
        });
      };

      // Stream the audio to the Speech API
      toRecognizeRequest.pipe(call);

      let reader = new wav.Reader();
      reader.on('data', pcmData => {
        toRecognizeRequest.write(pcmData);
      });
      reader.on('end', () => {
        toRecognizeRequest.end();
      });
      reader.on('error', err => {
        reject(err);
      });
      fs.createReadStream(inputFile).pipe(reader).resume();
    });
  });
}
