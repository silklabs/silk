/**
 * Copyright (c) 2016 Silk Labs, Inc. All Rights Reserved. Confidential and
 * Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import createLog from 'silk-log/device';
import type { Rect } from './yolo';
import type { ObjectBox } from './utils';

const log = createLog('silkext-yolo');

const MS_MISSING_TILL_LOST = 700;
const MS_NEW_TILL_VISIBLE = 150;
const MS_MAX_EXTRAPOLATE = 1000;
const IOU_THRESH = .5;
const IOA_THRESH = .75;

class Box {
  x: number;
  y: number;
  width: number;
  height: number;
  time: number;

  constructor(time: number, pos: Rect) {
    this.x = pos.x;
    this.y = pos.y;
    this.width = pos.width;
    this.height = pos.height;
    this.time = time;
  }

  toString(): string {
    return `{ x: ${this.x}, y: ${this.y}, w: ${this.width}, h: ${this.height}, ` +
        `time: ${this.time}`;
  }
}

class Obj {
  id: number;
  label: string
  prob: number
  box: Box;
  firstSeen: number;
  lastSeen: number
  lastFrameTime: number
  state: 'new' | 'visible' | 'missing' | 'gone';
  dnnBoxes: Array<Box>; // Historical boxes returned from dnn
  width: number;
  height: number;
  time: number;

  constructor(id: number, time: number, label: string, pos: Rect, prob: number) {
    this.id = id;
    this.label = label;
    this.prob = prob;
    this.box = new Box(time, pos);
    this.firstSeen = time;
    this.lastSeen = time;
    this.lastFrameTime = time;
    this.state = 'new'; // new, visible, missing, gone
    this.dnnBoxes = [this.box]; // Historical boxes returned from dnn
  }

  _overlapRoi(box: Rect): ?Rect {
    let xtl = Math.max(box.x, this.box.x);
    let ytl = Math.max(box.y, this.box.y);
    let xbr = Math.min(box.x + box.width, this.box.x + this.box.width);
    let ybr = Math.min(box.y + box.height, this.box.y + this.box.height);
    if (xtl < xbr && ytl < ybr) {
      return {x: xtl, y: ytl, width: xbr - xtl, height: ybr - ytl};
    }
    return null;
  }

  _intersection(box: Rect): number {
    let roi = this._overlapRoi(box);
    return roi ? roi.width * roi.height : 0;
  }

  _union(box: Rect): number {
    return this.width * this.height + box.width * box.height - this._intersection(box);
  }

  _iou(box: Rect): number {
    return this._intersection(box) / this._union(box);
  }

  _maxIoa(box: Rect): number {
    let ioaa = this._intersection(box) / this.box.width * this.box.height;
    let ioab = this._intersection(box) / box.width * box.height;
    log.debug(`  ioa: ${ioaa}, ${ioab}`);
    return Math.max(ioaa, ioab);
  }

  isSameObject(time: number, pos: Rect, label: string): boolean {
    log.debug(`Checking if box overlaps with Object ${this.id}`);
    if (label !== this.label) {
      log.debug(`  not same label ${this.label} vs. ${label}`);
      return false;
    }
    let box = new Box(time, pos);
    if (this._iou(box) >= IOU_THRESH || this._maxIoa(box) >= IOA_THRESH) {
      log.debug(`  Box matches this object`);
      return true;
    }
    return false;
  }

  update(time: number, pos: Rect, prob: number) {
    // Previously updated box is better, don't update with this one
    if (this.lastSeen === time && prob < this.prob) {
      return;
    }

    // Previously updated box is worse, remove it and use this one
    if (this.lastSeen === time) {
      this.dnnBoxes.shift();
    }

    this.box = new Box(time, pos); // TODO. smooth out
    this.prob = prob;
    this.lastSeen = time;
    this.dnnBoxes.unshift(this.box);
    log.debug(`Updating Object ${this.id} with detected box ${this.box.toString()}`);

    // Prune historical boxes
    let idx;
    for (idx = 1; idx < this.dnnBoxes.length; idx++) {
      if (time - this.dnnBoxes[idx].time >= MS_MAX_EXTRAPOLATE) {
        break;
      }
    }
    this.dnnBoxes.splice(idx);
  }

  // Predict object position for new time
  predictPos(time: number) {
    log.debug(`Updating prediction for Object ${this.id} with ` +
        `${this.dnnBoxes.length} previously detected boxes...`);
    let mid = box => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
    let prevBox;
    let vectors = [];
    this.dnnBoxes.forEach((box, idx) => {
      log.debug(`  Box ${idx} ${box.toString()}`);
      if (prevBox) {
        let dt = prevBox.time - box.time;
        let dx = (mid(prevBox).x - mid(box).x) / dt;
        let dy = (mid(prevBox).y - mid(box).y) / dt;
        let dw = (prevBox.width - box.width) / dt;
        let dh = (prevBox.height - box.height) / dt;
        if (dt >= MS_MAX_EXTRAPOLATE) {
          log.debug(`  Too old delta: ${dt / 1000} sec`);
          return;
        }
        vectors.push({dt, dx, dy, dw, dh});
      }
      prevBox = box;
    });

    let sum = (a, b) => a + b;
    let range = (l, r) => new Array(r - l + 1).fill().map((_, k) => k + l);
    let gnFn = n => Math.exp(n * n / -2);
    let gsumFn = N => range(0, N - 1).map(i => gnFn(i, N)).reduce(sum);

    if (vectors.length >= 1) {
      // Add Gaussian weighted vectors
      let d = {dx: 0, dy: 0, dw: 0, dh: 0, dn: vectors.length};
      let gsum = gsumFn(d.dn);
      vectors.forEach((vector, i) => {
        d.dx += gnFn(i) / gsum * vector.dx;
        d.dy += gnFn(i) / gsum * vector.dy;
        d.dw += gnFn(i) / gsum * vector.dw;
        d.dh += gnFn(i) / gsum * vector.dh;
      });
      let t = time - this.lastFrameTime;
      log.debug(`delta: ${d.dn} ${d.dx} ${d.dy} ${d.dw} ${d.dh} ${t}`);
      let midx = mid(this.box).x + d.dx * t;
      let midy = mid(this.box).y + d.dy * t;
      log.debug(`mids: ${t} ${midx} ${midy}`);
      let pos = {
        width: this.box.width, // + d.dw * t);
        height: this.box.height, // + d.dh * t);
        x: midx - (this.box.width / 2),
        y: midy - (this.box.height / 2),
      };
      this.box = new Box(time, pos);
      log.debug(`new predicted position: ${this.box.toString()}`);
    }
    this.lastFrameTime = time;
  }

  updateState(time: number, frameHasResults: boolean) {
    log.debug(`Object ${this.id} state: ${this.state} ` +
        `now: ${Math.floor(time)} lastSeen: ${Math.floor(this.lastSeen)} ` +
        `firstSeen: ${Math.floor(this.firstSeen)}`);
    switch (this.state) {
    case 'new':
      if (frameHasResults && this.lastSeen !== time) {
        // Haven't seen object consistently, consider this as noise
        log.debug(`  new to gone`);
        this.state = 'gone';
      } else if ((this.lastSeen - this.firstSeen) >= MS_NEW_TILL_VISIBLE) {
        log.debug(`  new to visible`);
        this.state = 'visible';
      }
      break;
    case 'visible':
      if (frameHasResults && this.time !== time) {
        log.debug(`  visible to missing`);
        this.state = 'missing';
      }
      break;
    case 'missing':
      if ((time - this.lastSeen) >= MS_MISSING_TILL_LOST) {
        log.debug(`  missing to gone`);
        this.state = 'gone';
      }
      break;
    default:
      log.warn(`Unknown state ${this.state}`);
      break;
    }
  }
}

class ObjectSmoother {
  nextId: number;
  objects: {[key: string]: Obj };
  lostObjects: {[key: string]: Obj };
  debugStr: string;

  constructor() {
    this.nextId = 0;
    this.objects = {};
    this.lostObjects = {};
  }

  addDebugStr(str: string) {
    this.debugStr += str + '\n';
  }

  onFrame(time: number, detectedObjects: Array<ObjectBox>) {
    this.debugStr = '';

    // Does this frame contain DNN results?
    let hasResults = !!detectedObjects;

    // Update prediction for this time
    for (let id in this.objects) {
      this.objects[id].predictPos(time);
    }

    if (hasResults) {
      detectedObjects.forEach(detectedObject => {
        let pos = detectedObject;
        let label = detectedObject.label;
        let prob = detectedObject.prob;
        let foundObjects = [];
        for (let id in this.objects) {
          if (this.objects[id].isSameObject(time, pos, label)) {
            foundObjects.push(this.objects[id]);
          }
        }

        if (foundObjects.length === 0) {
          this.objects[this.nextId.toString()] = new Obj(this.nextId, time,
              label, pos, prob);
          log.debug(`New object ${this.nextId} ${JSON.stringify(this.objects[this.nextId.toString()])}`);
          this.nextId++;
        } else if (foundObjects.length === 1) {
          foundObjects[0].update(time, pos, prob);
        } else {
          // TODO: what to do if multiple objs found?? maybe delete for now?
          log.warn('Multiple objects found, what to do!?!?!?');
        }
      });
    }
    for (let id in this.objects) {
      this.objects[id].updateState(time, hasResults);
    }

    // Remove gone objects
    for (let id in this.objects) {
      if (this.objects[id].state === 'gone') {
        delete this.objects[id];
      }
    }
  }

  getObjects() {
    let objects = [];
    for (let id in this.objects) {
      let object = this.objects[id];
      let retObj = {
        x: object.box.x,
        y: object.box.y,
        width: object.box.width,
        height: object.box.height,
        label: object.label,
        prob: object.prob,
        id: id,
      };
      if (object.state !== 'new') {
        objects.push(retObj);
      }
    }
    return objects;
  }
}

module.exports = ObjectSmoother;
