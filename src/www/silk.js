/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

// Uninitialized socket.io connection.
var socket = null;
// Keep the last 5000 messages visible in the window.
var max = 5000;
// Whether to log pings or not.
var logEnabled = false;
// Silk api
var api = silk({
  serverUrl: document.location.origin
});

function log(msg) {
  console.log(msg);
  if (!logEnabled) {
    return;
  }
  var e = document.createElement('div');
  e.textContent = msg;
  var l = document.getElementById('log');
  l.appendChild(e);
  while (l.childNodes.length > max)
    l.removeChild(l.childNodes[0]);
  e.scrollIntoView();
}

var monitors = document.getElementById('monitors');

function makeObjectUrl(array, mimeType) {
  var view = new Uint8Array(array);
  var blob = new Blob([view], { type: mimeType });
  return URL.createObjectURL(blob);
}

function logMsg(tag, msg) {
  log(tag + ' message: ' +
      (('objects' in msg) ? '[objects:' + msg.objects.length + ']' :'') +
      (('frame' in msg) ? '[frame:' + msg.contents + '] ' : '') +
      'from: '+ msg.id + ' at ' + msg.when
     );
}

var video = document.getElementById('video');
var activeStream = '';
function showPlayer(stream) {
  if (stream === activeStream) {
    return;
  }
  if (activeStream) {
    hidePlayer();
  }
  activeStream = stream;
  socket.on(activeStream, feedPlayer);
  socket.emit('join', activeStream);

  video.style.display = 'block';
  setTimeout(function() { document.body.addEventListener('click', hidePlayer); });
}

function hidePlayer() {
  video.style.display = 'none';
  socket.emit('leave', activeStream);
  socket.removeListener(activeStream, feedPlayer);
  activeStream = '';
  document.body.removeEventListener('click', hidePlayer);
}

function feedPlayer(msg) {
  logMsg('video', msg);
  if (!msg.frame) {
    return;
  }
  var mp4 = makeObjectUrl(msg.frame, 'video/mp4');
  video.src = mp4;
}

function listen(socket) {
  socket.on('connect', function () {
    while (monitors.firstChild) {
      monitors.removeChild(monitors.firstChild);
    }
    log('Connected, joining video-streams');
    socket.emit('join', 'video-streams');
  });

  socket.on('video-stream-new', function(msg) {
    log('New video stream '+ msg.id);
    // TODO: when this evolves into a full-blown web app, this should
    // become component-ized and shared with the native apps if
    // possible
    var stream = 'video-' + msg.id;
    var previewStream = 'video-preview-' + msg.id;

    var monitor = document.getElementById(msg.id);
    if (monitor) {
      socket.emit('leave', stream);
      socket.emit('leave', previewStream);
      monitors.removeChild(monitor);
    }

    var name = msg.name;
    var previewImage = document.createElement('img');

    var logoImage = document.createElement('img');
    var logoArray = new Uint8Array(msg.logo);
    if (logoArray.length > 0) {
      var blob = new Blob([logoArray], { type: 'image/png' });
      logoImage.src = URL.createObjectURL(blob);
    }

    var canvas = document.createElement('canvas');
    canvas.width = msg.previewSize.width;
    canvas.height = msg.previewSize.height;
    canvas.setAttribute('id', msg.id);
    canvas.addEventListener('click', function() { showPlayer(stream); });
    monitors.appendChild(canvas);

    socket.on(previewStream, function(msg) {
      if (msg && msg.frame) {
        logMsg('video preview', msg);
        var when = new Date(msg.when);

        var view = new Uint8Array(msg.frame);
        var blob = new Blob([view], { type: 'image/jpg' });
        URL.revokeObjectURL(previewImage.src);
        previewImage.src = URL.createObjectURL(blob);
        previewImage.onload = function() {
          renderPreview(canvas, name, when, previewImage, logoImage, msg.objects);
        };
      }
    });
    log('Joining preview stream ' + previewStream);
    socket.emit('join', previewStream);
  });

  socket.on('video-stream-delete', function(msg) {
    log('Dead video stream '+ msg.id);
    var stream = 'video-' + msg.id;
    var previewStream = 'video-preview-' + msg.id;
    socket.emit('leave', stream);
    socket.emit('leave', previewStream);
    var monitor = document.getElementById(msg.id);
    if (monitor) {
      monitors.removeChild(monitor);
    }
  });
}

function renderPreview(canvas, name, when, previewImage, logoImage, objects) {

  var ctx = canvas.getContext('2d');
  ctx.drawImage(previewImage, 0, 0);

  if (objects) {
    var objectColors = [
      'red',
      'lightgreen',
      'lightblue',
      'purple',
      'black',
      'orange',
    ];

    ctx.save();
    ctx.lineWidth = 1;
    ctx.font = "10px sans-serif";

    for (var i = 0; i < objects.length; ++i) {
      ctx.fillStyle = ctx.strokeStyle = objectColors[i % objectColors.length];
      ctx.fillStyle = 'black';

      var tag = objects[i].tag;
      var rects = objects[i].rects;
      for (var j = 0; j < rects.length; ++j) {
        var rect = rects[j];
        ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
        ctx.fillText(tag, rect.x, rect.y + rect.height + 10);
      }
    }
  }

  ctx.globalAlpha = 0.25;
  ctx.font = "12px serif";
  ctx.fillStyle = 'white';
  // Camera name
  ctx.textAlign = "end";
  ctx.fillText(name, canvas.width - 5, canvas.height - 5);

  // Timestamp
  ctx.textAlign = "start";
  ctx.fillText(when.toLocaleDateString() + ' ' + when.toLocaleTimeString(),
    5, canvas.height - 5);

  ctx.drawImage(logoImage, 0, 0);
  ctx.restore();
}

function toggleLog() {
  logEnabled = !logEnabled;
}

function restart() {
  socket.emit('cmd', { msg: 'restart' });
}

function start() {
  socket.emit('cmd', { msg: 'start' });
}

function stop() {
  socket.emit('cmd', { msg: 'stop' });
}

function light() {
  var on = document.getElementById('lightOn').checked;
  var intensity = document.getElementById('lightIntensity').value;
  socket.emit('cmd', { msg: 'light',
                       state: { on: on, intensity: intensity } });
}

api.socketio.address().then(function(result) {
  socket = io(result.url, {
    transports: ['websocket']
  });
  listen(socket);
}).catch(function (err) {
  console.error('Could not get socket.io address', err);
});

