/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @noflow
 */

'use strict';

// Its possible to track key events during processing of a network by
// listening to this event emitter.

module.exports = new (require('events').EventEmitter)();
