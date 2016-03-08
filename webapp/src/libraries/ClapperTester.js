import { EventEmitter} from 'events';

// Polyfill the hrtime() interface.  (The actual values returned don't
// actually matter for this tester.)
process.hrtime = (last) => {
  let nowSec = Date.now() / 1000;
  let current = [ nowSec | 0, (1e9 * (nowSec - (nowSec | 0))) | 0 ];
  if (typeof last === 'undefined') {
    return current;
  }
  return [ current[0] - last[0], current[1] - last[1] ];
};

// Webapp implementation of the device extension interface.
class WebappCamera extends EventEmitter {
}

class WebappLog {
  quiet = true;
  timeline = null;

  constructor(timeline) {
    this.timeline = timeline;
  }

  debug(msg) {
    if (!this.quiet) {
      console.log('[device-debug]', msg);
    }
  }

  info(msg) {
    if (msg.indexOf('clap') >= 0) {
      // HACK ALERT: we use log messages from the clapper to infer
      // that it detected a clap.
      this.timeline.emit('clap');
    }
    if (!this.quiet) {
      console.log('[device-info]', msg);
    }
  }
}

class WebappTimeline extends EventEmitter {
  addObject(tag) {
  }

  addObjects(tag) {
  }
}

class WebappUtil {
  getboolprop(prop, fallback) {
    return fallback;
  }

  getintprop(prop, fallback) {
    return fallback;
  }

  getprop(prop, fallback) {
    return fallback;
  }

  playSound(what) {
  }
}

class WebappEnv {
  timeline = new WebappTimeline();
  camera = new WebappCamera();
  log = new WebappLog(this.timeline);
  util = new WebappUtil();
}

class Clapper extends EventEmitter {
  env = new WebappEnv();
  clapper = null;

  constructor() {
    super();

    let DeviceClapper = require('../../../device/vendor/silk/ext/clapper/lib/clapper');
    this.clapper = new DeviceClapper(this.env);
    this.env.timeline.on('clap', () => this.emit('sound-event', 'clap'));
  }

  addSamples(samples) {
    this.env.camera.emit('mic-data', {
      when: Date.now(),
      frames: samples,
    });
  }
}

module.exports = (samples) => {
  let detector = new Clapper();
  let data = new Buffer(samples.buffer);
  let events = [ ];
  detector.on('sound-event', (what) => events.push(what));
  detector.addSamples(data);
  return events;
};
