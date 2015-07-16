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
    var stream = 'video-preview-'+ params.id;
    socket.on(stream, renderFrame);
    socket.emit('join', stream);
  });
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
