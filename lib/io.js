/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @noflow
 */

'use strict';

const fs = require('fs');

let readFileSync = fs.readFileSync;

// Use mmap if we have the module
try {
  const mmap = require('mmap-io');
  readFileSync = filename => {
    let fd = fs.openSync(filename, 'r');
    let filesize = fs.fstatSync(fd).size;
    let filedata = mmap.map(filesize, mmap.PROT_READ, mmap.MAP_PRIVATE, fd);
    fs.closeSync(fd);
    return filedata;
  };
} catch (e) { } // eslint-disable-line

module.exports = {
  readFileSync: readFileSync,
};
