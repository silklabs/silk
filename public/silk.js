/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

// Keep the last 5000 messages visible in the window.
var max = 5000;
// Whether to log pings or not.
var logEnabled = false;

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

var video = document.getElementById('video');
var activeStream = null;
function showPlayer(stream) {
  if (stream === activeStream) {
    return;
  }
  video.style.display = 'block';
  activeStream = stream;
  setTimeout(function() { document.body.addEventListener('click', hidePlayer); });
}

function hidePlayer() {
  video.style.display = 'none';
  activeStream = null;
  document.body.removeEventListener('click', hidePlayer);
}

function maybeFeedPlayer(stream, chunk) {
  if (stream !== activeStream) {
    return;
  }
  var mp4 = makeObjectUrl(chunk, 'video/mp4');
  video.src = mp4;
  return;
}

// Register for logging messages and display them.
var socket = io(document.location.origin);
socket.on('connect', function () {
  while (monitors.firstChild) {
    monitors.removeChild(monitors.firstChild);
  }

  socket.emit('join', 'logging');
  socket.on('log', function (msg) {
    log(msg);
  });
  socket.emit('join', 'video-streams');
  socket.on('video-stream-new', function(msg) {
    log('New video stream '+ msg.id);
    // TODO: when this evolves into a full-blown web app, this should
    // become component-ized and shared with the native apps if
    // possible
    var stream = 'video-' + msg.id;

    var monitor = document.getElementById(msg.id);
    if (monitor) {
      monitors.removeChild(monitor);
    }

    var img = document.createElement('img');
    img.setAttribute('title', msg.name);
    var a = document.createElement('a');
    a.setAttribute('id', msg.id);
    a.addEventListener('click', function() { showPlayer(stream); });
    a.href = '#';
    a.appendChild(img);
    monitors.appendChild(a);

    socket.on(stream, function(msg) {
      if (!msg) {
        return;
      }
      log('video message: ' +
        (('faces' in msg) ? '[faces:' + msg.faces.length + ']' :'') +
        (('frame' in msg) ? '[frame:' + msg.contents + '] ' : '') +
        'from: '+ msg.id + ' at ' + msg.when
      );
      switch (msg.contents) {
      case 'mp4':
        maybeFeedPlayer(stream, msg.frame);
        return;
      case 'jpeg':
        var jpeg = makeObjectUrl(msg.frame, 'image/jpg');
        var a = document.getElementById(msg.id);
        var img = a.firstChild;
        img.src = jpeg;
        return;
      default:
        return;
      }
    });
    socket.emit('join', stream);
  });
  socket.on('video-stream-delete', function(msg) {
    log('Dead video stream '+ msg.id);
    var monitor = document.getElementById(msg.id);
    var stream = 'video-' + msg.id;
    socket.emit('leave', stream);
    monitors.removeChild(monitor);
  });
});

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
