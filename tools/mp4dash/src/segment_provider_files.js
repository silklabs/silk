/*
 * @flow
 */

import createLog from 'silk-log';
import fs from 'mz/fs';

import SegmentProvider from './segment_provider';

const log = createLog('segment-provider-files');

export default class SegmentProviderFiles extends SegmentProvider {

  _files: Array<string>;

  constructor(files: Array<string>) {
    const id = new Date().toISOString();
    log.debug(`['${id}']: constructor()`);

    super(id);

    this._files = files;
    this._readNextFile();
  }

  async _readNextFile(): Promise<void> {
    log.debug(`['${this._id}']: _readNextFile()`);

    const file = this._files.shift();
    if (!file) {
      log.info(`['${this._id}']: Done`);
      this.emit(`close`);
      return;
    }

    log.info(`['${this._id}']: Reading '${file}'`);
    this.pushFrame(await fs.readFile(file));
    this._readNextFile();
  }
}
