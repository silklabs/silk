/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @noflow
 */

'use strict';

const assert = require('assert');
const Shape = require('./shape');

/*
 * All data we handle is stored in a 4D volume which we call a blob. Each
 * blob has a shape. Blob properties are immutable once created (the data
 * itself is however mutable).
 */
class Blob {
  constructor(shape) {
    assert(shape instanceof Shape);
    this.shape = shape;
    // The backend that allocate data for this blob will also set the subBlob
    // method that knows how to slice the blob into sub-blobs.
    this.subBlob = null;
  }

  // If this blob has a size greater than 1 along the batch_size dimension,
  // then return the n-th sub-blob. Each blob that is return has a singleton
  // shape (batch_size == 1).
  getBlob(b) {
    let shape = this.shape;
    let newShape = new Shape(1, shape.channels, shape.height, shape.width);
    let stride = newShape.size;
    return this.subBlob(shape, stride * b, stride * (b + 1));
  }

  // Call closure for each blob in this batch of blobs, handing the closure
  // a sub-blob containing only that blob as well as the index of the blob
  // in this batch.
  forEachBlob(closure) {
    let batch_size = this.shape.batch_size;
    for (let b = 0; b < batch_size; ++b) {
      closure(this.getBlob(b), b);
    }
  }

  // Call closure for each channel in each blob in this batch, handing the
  // closure a sub-blob that only contains the spatial data for that
  // channel, as well as the batch and channel indexes b and c.
  forEachChannel(closure) {
    let shape = this.shape;
    let batch_size = shape.batch_size;
    let channels = shape.channels;
    let newShape = new Shape(1, 1, shape.height, shape.width);
    for (let b = 0; b < batch_size; ++b) {
      for (let c = 0; c < channels; ++c) {
        let start = shape.index(b, c, 0, 0);
        let stop = start + shape.spatial;
        closure(this.subBlob(newShape, start, stop), b, c);
      }
    }
  }

  toString() {
    return 'Blob ' + this.shape + '';
  }
}

module.exports = Blob;
