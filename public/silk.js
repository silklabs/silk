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

var socket = io(document.location.origin, {
  transports: ['websocket']
});

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

  var img = document.createElement('img');
  img.setAttribute('title', msg.name);

  var logoImg = document.createElement('img');
  logoImg.setAttribute('title', 'logo');
  logoImg.style.display = 'none'
  var logo = msg.logo;
  var previewSize = msg.previewSize;

  var canvas = document.createElement('canvas');
  var a = document.createElement('a');
  a.setAttribute('id', msg.id);
  a.addEventListener('click', function() { showPlayer(stream); });
  a.href = '#';
  a.appendChild(img);
  a.appendChild(canvas);
  a.appendChild(logoImg);
  monitors.appendChild(a);

  socket.on(previewStream, function(msg) {
    if (!msg) {
      return;
    }
    logMsg('video preview', msg);
    var img = a.childNodes[0];
    var canvas = a.childNodes[1];

    renderFrame(msg, previewSize, img, canvas, logoImg, logo);
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

function renderLogo(logoImg, img, logo) {
  var view = new Uint8Array(logo);

  // Draw logo only once
  if ((view.length > 0) && (logoImg.style.display === 'none')) {
    logoImg.setAttribute('style', 'position:absolute;left:' +
        img.offsetLeft + 'px;top:' + img.offsetTop + 'px;' + 'opacity:0.5');
    logoImg.setAttribute('width',  '30px');
    logoImg.setAttribute('height', 'auto');

    var blob = new Blob([view], { type: 'image/png' });
    var png = URL.createObjectURL(blob);
    logoImg.src = png;
    logoImg.style.display = 'inline';
  }
}

function renderFrame(msg, previewSize, img, canvas, logoImg, logo) {
  if (msg.frame) {
    var view = new Uint8Array(msg.frame);
    var blob = new Blob([view], { type: 'image/jpg' });
    var jpeg = URL.createObjectURL(blob);

    // Draw objects and logo after img is loaded and size is valid
    img.onload = function() {
      drawObjectBorder(msg, previewSize, img, canvas);
      renderLogo(logoImg, img, logo);
    };
    img.src = jpeg;
  }
}


function drawObjectBorder(msg, previewSize, img, canvas) {
  canvas.width = img.clientWidth;
  canvas.height = img.clientHeight;
  canvas.setAttribute('style', 'position:absolute;left:' +
    img.offsetLeft + 'px;top:' + img.offsetTop + 'px;');

  var ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (msg.objects) {
    var objects = msg.objects;
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
    ctx.scale(canvas.width / previewSize.width,
      canvas.height / previewSize.height);

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

    ctx.restore();
  }
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
