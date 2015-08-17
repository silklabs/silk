
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';


function GenericLog(name) {
  this.element = document.getElementById(name);
  if (!this.element) {
    console.error('GenericLog: getElementById() failed for id=' + name);
    return;
  }

  this.enableElem = document.getElementById(name + 'Enable');
  this.log = function(msg) {
    this.element.innerText = msg;
  };
  this.clear = function() {
    this.element.innerText = "";
  };
  this.getEnable = function() { 
    if (this.enableElem) {
      return this.enableElem.checked;
    }
    return 1;
  };
}

var dash = new GenericLog('dash');
var procrank = new GenericLog('procrank');

var logcat = new function() {
  this.maxLines = 10000;
  this.logcat = document.getElementById('logcat');
  this.enableElem = document.getElementById('logcatEnable');
  this.pauseUpdate = false;
  this.newLogs = document.createDocumentFragment();
  this.updateTimer = null;

  this.log = function(msg) {
    var frag = this.newLogs;
    msg.split(/\r?\n/).map(function(line) {
      // TODO: need to escape HTML characters
      var e = document.createElement('div');
      var html = ansi_up.ansi_to_html(line);
      e.innerHTML = html;
      frag.appendChild(e);
    });
    // Limit DOM updates, otherwise UI is lags when log first enabled
    if (!this.updateTimer) {
      var self = this;
      this.updateTimer = setTimeout(function() {
        self.updateView();
        self.updateTimer = null;
      }, 20);
    }
  },
  this.updateView = function() {
    if (!this.pauseUpdate) {
      this.logcat.appendChild(this.newLogs);
      this.newLogs = document.createDocumentFragment();

      while (this.logcat.childNodes.length > this.maxLines) {
        this.logcat.removeChild(this.logcat.childNodes[0]);
      }
      this.logcat.lastChild && this.logcat.lastChild.scrollIntoView();
    }
  }
  this.clear = function() {
    while (this.logcat.firstChild) {
      this.logcat.removeChild(this.logcat.firstChild);
    }
  }
  this.getEnable = function() {
    return this.enableElem.checked;
  }
}

var logs = {
  'logcat': logcat,
  'procrank': procrank
};

function updateLogEnable(type) {
  if (logs[type].getEnable()) { 
    logs[type].clear(); 
  }
  if (cameras.selected && cameras.selected.id !== 'none') {
    emitLogEnable(cameras.selected.id, type);
  }
}

function updatePauseLogcat() {
  logcat.pauseUpdate = document.getElementById('pauseLogcat').checked;
  logcat.updateView();
}

// Add keyboard shortcut, ' ' to toggle pause logcat
document.body.onkeyup = function(event) { 
  var key = String.fromCharCode(event.keyCode);
  if (key === 'T') {
    var e = document.getElementById('pauseLogcat');
    e.checked = !e.checked;
    updatePauseLogcat();
  }
}

var cameras = new function() {
  this.init = function() {
    this.selected = null;
    while (this.cameras.firstChild) {
      this.cameras.removeChild(this.cameras.firstChild);
    }
    this.add('none', 'None');
    this.updateActive();
  };
  this.add = function(id, name) {
    var e = document.createElement('option');
    e.value = e.id = id;
    e.innerText = e.name = name;
    this.cameras.appendChild(e);
  };
  this.remove = function(id) {
    var camera = document.getElementById(id);
    camera && this.cameras.removeChild(camera);
  };
  this.updateActive = function() {
    // when swithing to new camera, disable diag from previously selected
    // camera, before enabling diag on newly selected camera
    if (this.selected && this.selected.id !== 'none') {
      emitLogEnable(this.selected.id, 'disable-all');
    }

    for (var log in logs) { logs[log].clear(); }

    this.selected = this.cameras.options[this.cameras.selectedIndex];
    if (this.selected.id !== 'none') {
      emitLogEnable(this.selected.id, 'update-all');
    }
  };

  this.cameras = document.getElementById('cameras');
  this.init();
}

var socket = io(document.location.origin, {
  transports: ['websocket']
});
socket.on('connect', function () {
  console.log('connected to server');
  socket.emit('join', 'logging');
  socket.emit('join', 'video-streams');
});

socket.on('log', function (msg) {
  if (cameras.selected && msg.id === cameras.selected.id) {
    switch (msg.type) {
    case 'dash':
      dash.log(msg.log);
      break;
    case 'procrank':
      procrank.log(msg.log);
      break;
    case 'logcat':
      logcat.log(msg.log);
      break;
    default:
      console.error('Unknown log type', msg.type);
      break;
    }
  }
});

socket.on('video-stream-new', function(msg) {
  console.log('New  camera', msg.name, msg.id);
  cameras.add(msg.id, msg.name);
});

socket.on('video-stream-delete', function(msg) {
  console.log('Lost camera', msg.name, msg.id);
  cameras.remove(msg.id);
});

socket.on('disconnect', function(e) {
  console.log('lost connection to server');
  cameras.init();
});

function emitLogEnable(id, type) {
  var config = {}
  var force = (type === 'update-all' || type === 'disable-all');
  var forceDisable = (type === 'disable-all');

  config.dash = 1;
  if (force || type === 'logcat') {
    config.logcat = !forceDisable && logcat.getEnable() ? 1 : 0;
  }
  if (force || type === 'procrank') {
    config.procrank = !forceDisable && procrank.getEnable() ? 1 : 0;
  }

  socket.emit('cmd', { 
    id: id,
    msg: 'diag', 
    config: config
  });
}
