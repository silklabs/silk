/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

window.onerror = function(e) {
  log('Uncaught error: '+ e.toString());
};

function log(msg) {
  //document.getElementById('log').textContent += msg +'\n';
}

function connectBridge(then) {
  if (window.WebViewJavascriptBridge) {
    return then(WebViewJavascriptBridge);
  }
  document.addEventListener('WebViewJavascriptBridgeReady', function() {
    then(WebViewJavascriptBridge);
  }, false);
}

log('loaded');

connectBridge(function(bridge) {
  log('connected bridge!');
  bridge.init(function(msg) {
    init(msg);
  });
  log('registered message handler');
});

var img = document.getElementById('img');
var socket = null;

function init(params) {
  log('got message '+ params +' from bridge!');
  log('id: '+ params.id);
  log('serverUrl: '+ params.serverUrl);

  log('Connecting to '+ params.serverUrl + '...');
  socket = io(params.serverUrl);
  socket.on('connect', function() {
    log(' ... connected');
    var stream = 'video-'+ params.id;
    socket.on(stream, renderFrame);
    socket.emit('join', stream);
  });
}

/**
 * Return the r8g8b8x8 conversion of `yuv420sp` with `width x height`
 * dimensions as a Uint8ClampedArray.
 */
function convertYuv420spToR8g8b8(width, height, yuv420sp) {
  var nrPixels = width * height;
  var nrBytes = nrPixels/*y data*/ + nrPixels / 2/*u and v*/;
  if (yuv420sp.length !== nrBytes) {
    throw 'Array is the wrong length';
  }
  var rgbx = new Uint8ClampedArray(nrPixels * 4/*r,g,b,x*/);
  var pixStride = width;
  var uvStart = nrPixels;
  for (var row = 0; row < height; ++row) {
    for (var col = 0; col < width; ++col) {
      var yOffset = row * pixStride + col;
      var uOffset = (row >> 1) * (pixStride >> 1) + (col >> 1);
      uOffset = uvStart + uOffset * 2;
      var vOffset = uOffset + 1;     
      var y = yuv420sp[yOffset];
      var u = yuv420sp[uOffset];
      var v = yuv420sp[vOffset];

      var bgraOffset = 4 * (pixStride * row + col);
      rgbx[bgraOffset + 0] = y + 1.732446 * (u - 128);
      rgbx[bgraOffset + 1] = y - 0.698001 * (v - 128) - 0.337633 * (u - 128);
      rgbx[bgraOffset + 2] = y + 1.370705 * (v - 128);
      rgbx[bgraOffset + 3] = 255;
    }
  }
  return rgbx;
}

function renderFrame(msg) {
  if (!msg.frame) {
    return;
  }
  var view = new Uint8Array(msg.frame);
  var blob = new Blob([view], { type: 'image/jpg' });
  var jpeg = URL.createObjectURL(blob);
  img.src = jpeg;
}
