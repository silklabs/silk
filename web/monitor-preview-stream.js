/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

window.onerror = function(e) {
  log('Uncaught error: '+ e.toString());
};

function log(msg) {
  // Use Safari to open the developer console that these log messages
  // appear in:
  //
  //   Safari -> Develop -> iOS Simulator -> monitor-preview-stream.html
  console.log(msg);
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

var canvas = document.getElementById('canvas');
var img = document.getElementById('img');
var socket = null;

function init(params) {
  log('got message '+ params +' from bridge!');
  log('id: '+ params.id);
  log('serverUrl: '+ params.serverUrl);
  log('resizing canvas to '+ params.width +' x '+ params.height);
  canvas.width = params.width;
  canvas.height = params.height;
  img.width = params.width;
  img.height = params.height;

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
  if (msg.frame) {
    var view = new Uint8Array(msg.frame);
    var blob = new Blob([view], { type: 'image/jpg' });
    var jpeg = URL.createObjectURL(blob);
    img.src = jpeg;
  }

  var ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!('faces' in msg) || msg.faces.length == 0) {
    return;
  }
  ctx.save();

  ctx.lineWidth = 4;
  ctx.strokeStyle = 'lightblue';

  ctx.scale(canvas.width / msg.faces[0].fieldWidth,
            canvas.height / msg.faces[0].fieldHeight);
  for (var i = 0; i < msg.faces.length; ++i) {
    var face = msg.faces[i];
    ctx.strokeRect(face.x, face.y, face.width, face.height);
  }

  ctx.restore();
}
