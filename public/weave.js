/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

// Keep the last 5000 messages visible in the window.
var max = 5000;
// Whether to log pings or not.
var logEnabled = false;

function log(msg) {
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

// Register for logging messages and display them.
var socket = io(document.location.origin);
socket.on('connect', function () {
  socket.emit('join', 'logging');
  socket.on('log', function (msg) {
    log(msg);
  });
  socket.on('video', function(msg) {
    log('video message: '+ (('faces' in msg) ? '[faces] ':'') +
        (('frame' in msg) ? '[frame] ' : '') + 'from: '+ msg.id);
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
