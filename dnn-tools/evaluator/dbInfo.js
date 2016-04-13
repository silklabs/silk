/**
 * Transcribed from matlab code with the following license:
 * Copyright (c) 2012, Piotr Dollar
 * All rights reserved.
 *
 */

'use strict';

/**
 * 'name' specifies the name of the dataset. One can specify a subset of a
 * dataset by appending digits to the end of the name (eg. 'UsaTest01' indicates
 * first set of 'UsaTest' and 'UsaTest01005' indicate first set, fifth video).
 *
 * USAGE
 *  let {name, setIds, vidIds, nFrame, skip} = dbInfo(name)
 *
 * INPUTS
 *  name     - ['UsaTest'] specify dataset
 *
 * OUTPUTS
 *  name     - Dataset name
 *  setIds   - integer ids of each set
 *  vidIds   - [1 x n] array of array of integer ids of each video per set
 *  nFrame   - [1 x n] array of array of num of frames of each video per set
 *  skip     - specify subset of frames to use for evaluation
 */

function dbInfo(name) {
  console.log(`Getting db info for ${name}`);
  let skip = 0;
  let vidIds = [];
  let setIds = [];
  let nFrame = [];

  let vidId = parseInt(name.slice(-3)); // Check if name ends in 3 ints
  console.log(`vidId: ${vidId}`);
  if (!isNaN(vidId)) {
    name = name.slice(0, name.length - 3);
  }

  let setId = parseInt(name.slice(-2)); // Check if name ends in 2 ints
  console.log(`setId: ${setId}`);
  if (!isNaN(setId)) {
    name = name.slice(0, name.length - 2);
  }

  switch (name) {
  case 'UsaTest': // Caltech Pedestrian Datasets (testing)
    setIds = [6, 7, 8, 9, 10];
    skip = 30;
    vidIds = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
              [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
              [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
              [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
              [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]];
    nFrame = [[1842, 1842, 1775, 1775, 1841, 1841, 1842, 1841, 1841, 1842, 1841,
               1842, 1842, 1841, 1841, 1842, 1841, 1841, 1842],
              [1842, 1842, 1841, 1841, 1977, 2175, 1841, 1842, 1842, 1841, 1841,
               1800],
              [1785, 1785, 1842, 1841, 1841, 1842, 1841, 1842, 1842, 1680, 1681],
              [1865, 1865, 1841, 1841, 1798, 1988, 1842, 1842, 1841, 1841, 1841,
               1869],
              [1842, 1841, 1841, 1841, 1841, 1841, 1841, 1842, 1842, 1842, 1841,
               1734]];
    break;
  case 'FDDB': // Caltech Pedestrian Datasets (testing)
    setIds = [0];
    skip = 1;
    vidIds = [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]];
    nFrame = [[290, 285, 274, 302, 298, 302, 279, 276, 259, 280]];
    break;
  default:
    break;
  }

  // Optionally select only specific set/vid if name ended in ints
  if (!isNaN(setId)) {
    setIds = setIds.slice(setId - 1, setId);
    vidIds = vidIds.slice(setId - 1, setId);
    nFrame = nFrame.slice(setId - 1, setId);
  }
  if (!isNaN(vidId)) {
    vidIds = [vidIds[0].slice(vidId - 1, vidId)];
    nFrame = [nFrame[0].slice(vidId - 1, vidId)];
  }

  return {name, setIds, vidIds, nFrame, skip};
}

module.exports = dbInfo;
