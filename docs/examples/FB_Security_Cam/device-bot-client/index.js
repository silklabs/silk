'use strict';

const log = require('silk-alog'),
  Camera = require('silk-camera').default,
  path = require('path'),
  request = require('request'),
  fs = require('fs'),
  urljoin = require('url-join'),
  https = require('https'),
  wifi = require('silk-wifi').default;


require('request').debug = true
let device = require('./device');
device.init();
const config = require('./config');
const fullUploadUrl = config.uploadUrl + '/' + config.id + '/' + config.secret
let uploadBusy = false;

let camera = new Camera();
camera.init()
  .then(() => {
    log.info('camera initialized');
    camera.startRecording();
  }).catch(e => {
    log.info('Error: ' + e);
  });



wifi.init()
  .then(() => {
    return wifi.online();
  })
  .then(() => {
    log.info('========= Wifi initialized successfully =========');
    require('silk-ntp').default;

    camera.on('frame', (when, image) => {
      log.info('========= Capturing a new frame =========');
      log.info('========= uploadBusy status: ' + uploadBusy);

      if (image.width() < 1 || image.height() < 1) {
        throw new Error('Image has no size');
      }

      if (!uploadBusy) {
        const filename = '/data/camera_image.png';
        image.save(filename);
        log.info('========= Saved image ' + filename);

        let imageSendingData = {
          campicture: {
            value: fs.createReadStream(filename),
            options: {
              filename: 'camera_image.png',
              contentType: 'image/png'
            }
          }
        };
        uploadBusy = true;
        let req = request.post({
          url: fullUploadUrl,
          formData: imageSendingData,
          preambleCRLF: true,
          postambleCRLF: true
        }, function(err, httpResponse, body) {
          uploadBusy = false;
          /*if (err) {
            req.end();
            return log.info('upload failed:' + err);
          }*/
          req.end();
          log.info('Upload successful!  Server responded with:' + body);
        }).on('response', function(response) {
          log.info(response.statusCode) // 200
          log.info(response.headers['content-type']) // 'image/png'
        });
        log.info('========= uploadBusy ending status: ' + uploadBusy);
      }
    });
  })
  .catch(err => {
    log.error('Failed to initialize wifi', err);
  });
