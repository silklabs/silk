/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @noflow
 */

'use strict';

const assert = require('assert');

/*
 * All data is represented internally as a 4D volume of numbers. The dimensions
 * of this volume are described by an immutable shape object. The 4 dimensions
 * are:
 *   1. batch_size (number of datums processed in parallel)
 *   2. channels (number of features per spatial location)
 *   3. height
 *   4. width
 */
class Shape {
  constructor(batch_size, channels, height, width) {
    assert(batch_size && channels && height && width);
    this.batch_size = batch_size;
    this.channels = channels;
    this.height = height;
    this.width = width;
    Object.freeze(this);
  }

  // The total number of elements in Blobs with this shape
  get size() {
    return this.batch_size * this.channels * this.height * this.width;
  }

  // The number of elements in each channel (this is the spatial dimension)
  get spatial() {
    return this.height * this.width;
  }

  // Check whether the given coordinates are valid for this shape
  valid(b, c, y, x) {
    return b >= 0 && b < this.batch_size &&
      c >= 0 && c < this.channels &&
      y >= 0 && y < this.height &&
      x >= 0 && x < this.width;
  }

  // Return the index into the data buffer for the given coordinates
  index(b, c, y, x) {
    return (((b * this.channels) + c) * this.height + y) * this.width + x;
  }

  // Check whether this shape has the same shape as the other one
  equals(other) {
    return this.batch_size === other.batch_size
      && this.channels === other.channels
      && this.height === other.height
      && this.width === other.width;
  }

  toString() {
    return [this.batch_size, this.channels, this.height, this.width].join(' x ');
  }
}

module.exports = Shape;
