/**
 * @flow
 */

import createLog from 'silk-log';
import invariant from 'assert';

const log = createLog('ObjectCollector');

// XXX Dedupe from timeline.js
type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

// XXX Dedupe from timeline.js
type TimelineEventObject = {
  id: number;
  source: string;
  tag: string;
  when: number;
  durationMs: number;
  rects: Array<Rect>;
  [arbitraryKeys: string]: any;
};

export default class ObjectCollector {

  _objects: Map<number, Array<TimelineEventObject>> = new Map();
  _lastCollectTime: number = 0;
  _interpolationMs: number;
  _maxArea: number;
  _maxSmoothingAmount: number;
  _latestDeviceTime: number = 0;

  constructor(
    interpolationMs?: number = 16,
    maxSmoothingAmount?: number = 50,
  ) {
    this._interpolationMs = Math.round(interpolationMs);
    this._maxSmoothingAmount = maxSmoothingAmount;
  }

  _areRectsIdenticalAfterSmoothing(
    first: Rect,
    second: Rect,
  ): boolean {
    const areaFactor = first.width * first.height / this._maxArea;
    const smoothingAmount = areaFactor * this._maxSmoothingAmount;

    const dimensions = ['x', 'y', 'width', 'height'];

    const identicalDimensions = dimensions.reduce((result, dimension) => {
      const difference = Math.abs(second[dimension] - first[dimension]);
      if (difference <= smoothingAmount) {
        if (difference !== 0) {
          second[dimension] = first[dimension];
        }
        return result + 1;
      }
      return result;
    }, 0);

    return identicalDimensions === dimensions.length;
  }

  _maybeInterpolate(
    array: Array<TimelineEventObject>,
    first: TimelineEventObject,
    second: TimelineEventObject
  ): void {
    invariant(first.when !== second.when);

    if (first.when > second.when) {
      log.warn(`Received objects out of order, ignoring`, first, second);
      return;
    }

    if (first.rects.length !== 1 || second.rects.length !== 1) {
      log.debug(`Not interpolating multi-rect objects`, first, second);
      if (!first.durationMs ||
          (first.when + first.durationMs) > second.when) {
        first.durationMs = second.when - first.when;
      }
      array.push(second);
      return;
    }

    const firstRect = first.rects[0];
    const secondRect = second.rects[0];

    if (this._areRectsIdenticalAfterSmoothing(firstRect, secondRect)) {
      log.debug(`Not interpolating because rects are identical after ` +
                `smoothing`);
      first.durationMs = second.when - first.when;
      array.push(second);
      return;
    }

    if (this._lastCollectTime >= second.when) {
      log.debug(`Not interpolating because we've already collected during ` +
                `the time that we could have interpolated`,
                first,
                second,
                this._lastCollectTime);
      first.durationMs = second.when - first.when;
      array.push(second);
      return;
    }

    let interpolationStart;
    let lastCollectTimeOffset;

    if (first.when < this._lastCollectTime) {
      interpolationStart = this._lastCollectTime;
      lastCollectTimeOffset = this._lastCollectTime - first.when;
    } else {
      interpolationStart = first.when;
      lastCollectTimeOffset = 0;
    }

    // Figure out how many objects we need to add.

    const interpolationRange = second.when - interpolationStart;
    invariant(interpolationRange >= 0);
    const interpolationCount =
      Math.floor(interpolationRange / this._interpolationMs);

    let last = first;

    if (interpolationCount > 1) {
      const xInc = (secondRect.x - firstRect.x) / interpolationCount;
      const yInc = (secondRect.y - firstRect.y) / interpolationCount;
      const wInc = (secondRect.width - firstRect.width) / interpolationCount;
      const hInc = (secondRect.height - firstRect.height) / interpolationCount;
      const durationMs = Math.floor(interpolationRange / interpolationCount);

      first.durationMs = lastCollectTimeOffset + durationMs;

      for (let i = 1; i < interpolationCount; i++) {
        const lastRect = last.rects[0];
        const interpolatedObject = Object.assign({}, first, {
          when: last.when + last.durationMs,
          durationMs,
          rects: [{
            x: lastRect.x + xInc,
            y: lastRect.y + yInc,
            width: lastRect.width + wInc,
            height: lastRect.height + hInc,
          }],
        });
        array.push(interpolatedObject);
        last = interpolatedObject;
      }

      log.debug(`Added ${interpolationCount - 1} objects to cover ` +
                `${interpolationRange}ms`);
    } else {
      log.debug(`Not interpolating because there isn't enough time`);
    }

    last.durationMs = second.when - last.when;
    array.push(second);
  }

  get deviceTime(): number {
    return this._latestDeviceTime;
  }

  push(deviceTime: number, objects: Array<TimelineEventObject>, maxWidth: number, maxHeight: number): void {
    log.debug(`Pushed ${objects.length} objects`);
    this._latestDeviceTime = deviceTime;

    invariant(maxWidth);
    invariant(maxHeight);
    this._maxArea = maxWidth * maxHeight; // Sorry!

    objects.forEach((object) => {
      let array = this._objects.get(object.id);
      if (array) {
        invariant(array.length);
        const lastObjectIndex = array.length - 1;
        const lastObject = array[lastObjectIndex];
        if (lastObject.when === object.when) {
          array[lastObjectIndex] = object;
        } else {
          this._maybeInterpolate(array, lastObject, object);
        }
      } else {
        this._objects.set(object.id, [object]);
      }
    });
  }

  collect(durationMs: number): Map<number, Array<TimelineEventObject>> {
    invariant(durationMs > 0);
    const start = this._latestDeviceTime - durationMs;
    const end = this._latestDeviceTime;

    log.debug(`Collecting between ${start} and ${end} (${end - start} ms)`);
    invariant(start <= end);
    invariant(end >= this._lastCollectTime);

    this._lastCollectTime = end;

    let objects = new Map();
    let expiredIds;

    this._objects.forEach((array, objectId) => {
      let expireObjectId = true;
      let expiredObjects;

      array.forEach((object) => {
        let include = false;
        if (object.when <= start) {
          if (!object.durationMs ||
              object.when + object.durationMs >= start) {
            include = true;
            expireObjectId = false;
          } else if (object.when + object.durationMs < start) {
            expiredObjects = expiredObjects || [];
            expiredObjects.push(object);
          }
        } else {
          if (object.when <= end) {
            include = true;
          }
          expireObjectId = false;
        }

        if (include) {
          let existingArray = objects.get(objectId);
          if (existingArray) {
            existingArray.push(object);
          } else {
            objects.set(objectId, [object]);
          }
        }
      });

      if (expireObjectId) {
        expiredIds = expiredIds || [];
        expiredIds.push(objectId);
      } else if (expiredObjects) {
        expiredObjects.forEach((expired) => {
          const index = array.indexOf(expired);
          invariant(index >= 0);
          array.splice(index, 1);
        });
        invariant(array.length);
      }
    });

    if (expiredIds) {
      expiredIds.forEach((id) => {
        this._objects.delete(id);
      });
    }

    return objects;
  }

  clear() {
    this._objects.clear();
    this._lastCollectTime = 0;
  }
}
