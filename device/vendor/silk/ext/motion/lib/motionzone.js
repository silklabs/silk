/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import fs from 'mz/fs';
import cv from 'opencv';

import type { Env, Log } from 'silk-exttest';
import type { Matrix } from 'opencv';
type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};
type Size = {width: number, height: number};

const MOTION_ZONES_FILE = 'data/silk/opencv/motion_zones.json';
let log: Log;

/**
 * This class provides utility functions to implement motion zones
 */
export default class MotionZone {
  _env: Env;
  _ignoredZones: Array<Rect>;
  _ignoredZoneMask: Matrix;

  constructor(env: Env, size: Size) {
    this._env = env;
    log = this._env.log;
    this._ignoredZones = [];

    this._ignoredZoneMask = new cv.Matrix(size.height, size.width, cv.Constants.CV_8UC1, [255]);

    this._parseMotionZones()
    .then(() => {
      if (this._ignoredZones.length > 0) {
        this._ignoredZones.forEach(zone => {
          this._ignoredZoneMask.rectangle(
            [zone.x, zone.y],
            [zone.width, zone.height],
            [0, 0, 0],
            cv.Constants.CV_FILLED,
          );
        });
      }
    });
  }

  /**
   * Applies the ignore mask to the provided matrix returning a new matrix.
   * Pixels that are within the boundaries of the ignore mask will be set to 0.
   */
  applyIgnoreMask(im: Matrix): Matrix {
    let maskedIm = new cv.Matrix();
    im.copyWithMask(maskedIm, this._ignoredZoneMask);
    return maskedIm;
  }

  /**
   * Group object rectangles that intersect with each other
   *
   * @param array of rectangles to be merged
   * @returns none does inplace merges
   */
  groupRectangles(array: Array<Rect>) {
    let didMerge;

    /**
     * Compare any two rectangles and see if they intesect with each other, if
     * they do then merge them. The resulting merged rectangle could now intersect
     * with some other rectangles so repeat the process until there are no more
     * rectangles to be merged.
     */
    do {
      didMerge = false;

      for (let i = 0; i < (array.length - 1); i++) {
        // Skip over any slices that have been merged
        if (array[i].height === 0) {
          continue;
        }

        for (let j = i + 1; j < array.length; j++) {
          // Skip over any slices that have been merged
          if (array[j].height === 0) {
            continue;
          }
          if (this._intersects(array[i], array[j])) {
            // Adjust the 1st rectangle to the size of merged rectangle
            array[i] = this._merge(array[i], array[j]);

            // Mark the height of second rectangle as zero as having been merged
            // This is done to avoid having to change the size of the array while
            // iterating over it
            array[j].height = 0;

            didMerge = true;
          }
        }
      }

      // Remove any rectangles that have been merged (have 0 height)
      let i = 0;
      while (i < array.length) {
        if (array[i].height === 0) {
          array.splice(i, 1);
        } else {
          i++;
        }
      }
    } while (didMerge);
  }

  /**
   * Check if two rectangles intersect with each other
   *
   * @param r1 rectangle 1 to check for intersection
   * @param r2 rectangle 2 to check for intersection
   * @returns true if rectangles intersect with each other false otherwise
   */
  _intersects(r1: Rect, r2: Rect) {
    return !((r2.x > r1.x + r1.width)
        || (r2.x + r2.width < r1.x)
        || (r2.y > r1.y + r1.height)
        || (r2.y + r2.height < r1.y));
  }

  /**
   * Check if one rectangle is contained within another
   *
   * @param r1
   * @param r2
   * @returns true if r1 contains r2 false otherwise
   */
  _contains(r1: Rect, r2: Rect) {
    return ((r1.x <= r2.x) && ((r1.x + r1.width) >= (r2.x + r2.width)) &&
            (r1.y <= r2.y) && ((r1.y + r1.height) >= (r2.y + r2.height)));
  }

  /**
   * Merge two rectangles
   *
   * @param r1 rectangle 1 to be merged
   * @param r2 rectangle 2 to be merged
   * @returns merged rectangle
   */
  _merge(r1: Rect, r2: Rect) {
    let minx = Math.min(r1.x, r2.x);
    let miny = Math.min(r1.y, r2.y);
    return {
      x: minx,
      y: miny,
      width: Math.max(r1.x + r1.width, r2.x + r2.width) - minx,
      height: Math.max(r1.y + r1.height, r2.y + r2.height) - miny,
    };
  }

  /**
   * Convert motion zones string into motion zone rectangles
   * Format: JSON [{"x": number, "y": number, "width": number, "height": number}]
   */
  async _parseMotionZones() {
    try {
      if (await fs.exists(MOTION_ZONES_FILE)) {
        let motionZonesStr = await fs.readFile(MOTION_ZONES_FILE);
        this._ignoredZones = JSON.parse(motionZonesStr);
        log.verbose(`Setting ignored zones to: ${JSON.stringify(this._ignoredZones)}`);
      }
    } catch (e) {
      log.error(`Error reading ${MOTION_ZONES_FILE}, error: ${e}`);
    }
  }
}
