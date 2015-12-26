/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import createLog from './log';
import events from 'events';
import childProcess from 'child_process';

const log = createLog('network');

class Network extends events.EventEmitter {
  constructor() {
    super();
  }

  traceroute(host) {
    let result = '';

    log.info(`Running traceroute ${host}`);

    return new Promise(resolve => {
      let helper = childProcess.spawn('traceroute', [host]);
      helper.stdout.on('data', data => {
        data = data.toString();
        result += data;
        process.stdout.write(data);
      });
      helper.on('close', () => resolve(result));
    });
  }
}

module.exports = new Network();
