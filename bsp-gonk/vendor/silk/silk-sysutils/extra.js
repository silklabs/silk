/**
 * @flow
 * @private
 */

import cv from 'opencv';

import type {Matrix} from 'opencv';

/**
 * Read a given image and return an opencv Matrix
 *
 * @param  {string} fileName Path to the image file to read
 * @return {Matrix} Opencv matrix for the image
 */
export function readImage(fileName: string): Promise<Matrix> {
  return new Promise((resolve, reject) => {
    cv.readImage(fileName, (err, im) => {
      if (err) {
        reject(err);
        return;
      }
      if (im.width() <= 0 || im.height() <= 0) {
        reject(new Error('Input image has no size'));
        return;
      }
      resolve(im);
    });
  });
}
