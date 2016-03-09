/**
 * @flow
 */

import createLog from 'silk-log';
import invariant from 'assert';

const log = createLog('ObjectCollector');

// XXX Dedupe from timeline.js
type TimelineEventObject = {
  id: number;
  source: string;
  tag: string;
  when: number;
  durationMs: number;
  [arbitraryKeys: string]: any;
};

export default class ObjectCollector {

  _objects: Map<number, Array<TimelineEventObject>> = new Map();

  push(objects: Array<TimelineEventObject>): void {
    log.debug(`Pushed ${objects.length} objects`);
    invariant(objects.length);

    objects.forEach((object) => {
      let array = this._objects.get(object.id);
      if (array) {
        invariant(array.length);
        const lastObjectIndex = array.length - 1;
        const lastObject = array[lastObjectIndex];
        if (lastObject.when === object.when) {
          array[lastObjectIndex] = object;
        } else {
          if (!lastObject.durationMs ||
              (lastObject.when + lastObject.durationMs) > object.when) {
            lastObject.durationMs = object.when - lastObject.when;
          }
          array.push(object);
        }
      } else {
        this._objects.set(object.id, [object]);
      }
    });
  }

  collect(start: number, end: number): Map<number, Array<TimelineEventObject>> {
    log.debug(`Collecting between ${start} and ${end} (${end - start} ms)`);
    invariant(start <= end);

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
  }
}
