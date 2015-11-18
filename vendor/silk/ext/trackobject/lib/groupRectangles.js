/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

/**
 * Check if two rectangles intersect with each other
 *
 * @param r1 rectangle 1 to check for intersection
 * @param r2 rectangle 2 to check for intersection
 * @returns true if rectangles intersect with each other false otherwise
 */
function intersects(r1, r2) {
  return !(r2.x > r1.x + r1.width
      || r2.x + r2.width < r1.x
      || r2.y > r1.y + r1.height
      || r2.y + r2.height < r1.y);
}

/**
 * Merge two rectangles
 *
 * @param r1 rectangle 1 to be merged
 * @param r2 rectangle 2 to be merged
 * @returns merged rectangle
 */
function merge(r1, r2) {
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
 * Group object rectangles that intersect with each other
 *
 * @param array of rectangles to be merged
 * @returns none does inplace merges
 */
export default function groupRectangles(array) {
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
        if (intersects(array[i], array[j])) {
          // Adjust the 1st rectangle to the size of merged rectangle
          array[i] = merge(array[i], array[j]);

          // Mark the height of second rectangle as zero as having been merged
          // This is done to avoid having to change the size of the array while
          // iterating over it
          array[j].height = 0;

          didMerge = true;
        }
      }
    }
    // Remove any rectangles that have been merged (have 0 height)
    for (let i = 0; i < array.length; i++) {
      if (array[i].height === 0) {
        array.splice(i, 1);
      }
    }
  } while (didMerge);
}
