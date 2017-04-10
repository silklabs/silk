/**
 * @private
 * @flow
 */

import EventEmitter from 'events';
import * as util from 'silk-sysutils';

/**
 * Silk volume module
 *
 * @module silk-volume
 * @example
 * const volume = require('silk-volume').default;
 * volume.level = 50;
 * volume.mute = false;
 */
class Volume extends EventEmitter {
  _level: number;
  _mute: boolean;

  constructor() {
    super();
    this._level = util.getintprop('persist.silk.volume.level', 0);
    this._mute = util.getboolprop('persist.silk.volume.mute', false);
    util.propWatcher.on('persist.silk.volume.mute', this._onMuteChange.bind(this));
    util.propWatcher.on('persist.silk.volume.level', this._onLevelChange.bind(this));
  }

  /**
   * Gets the current volume level (0..100).  Note that the value returned is
   * unaffected by the active mute setting.
   *
   * @memberof silk-volume
   * @instance
   */
  get level(): number {
    return this._level;
  }

  /**
   * Sets the current volume level (0..100)
   *
   * @memberof silk-volume
   * @instance
   */
  set level(newlevel: number): void {
    if (newlevel < 0 || newlevel > 100) {
      throw new Error('Invalid volume level', newlevel);
    }
    this._level = newlevel;
    util.setprop('persist.silk.volume.level', newlevel);

    /**
     * Emitted when the volume level changes
     *
     * @event level
     * @param {number} Level volume level
     * @memberof silk-volume
     * @instance
     */
    this._throwyEmit('level', newlevel);
  }

  /**
   * Gets the current volume mute
   *
   * @memberof silk-volume
   * @instance
   */
  get mute(): boolean {
    return this._mute;
  }

  /**
   * Sets the current volume mute
   *
   * @memberof silk-volume
   * @instance
   */
  set mute(newmute: boolean): void {
    this._mute = newmute;
    util.setprop('persist.silk.volume.mute', newmute);

    /**
     * Emitted when the volume mute changes
     *
     * @event mute
     * @param {bool} Mute enabled or disabled
     * @memberof silk-volume
     * @instance
     */
    this._throwyEmit('mute', newmute);
  }

  /**
   * Emit an event, and re-throw any exceptions to the process once the current
   * call stack is unwound.
   *
   * @private
   */
  // Legitimate use of 'any' here based on the fact that Flow's library
  // definition for EventEmitter uses it.
  // eslint-disable-next-line flowtype/no-weak-types
  _throwyEmit(eventName: string, ...args: Array<any>): void {
    try {
      this.emit(eventName, ...args);
    } catch (err) {
      process.nextTick(() => {
        util.processthrow(err.stack || err);
      });
    }
  }

  /**
   * External notification of mute change
   *
   * @private
   */
  _onMuteChange() {
    const mute = util.getboolprop('persist.silk.volume.mute', false);
    if (mute !== this._mute) {
      this.mute = mute;
    }
  }

  /**
   * External notification of level change
   *
   * @private
   */
  _onLevelChange() {
    const level = util.getintprop('persist.silk.volume.level', 0);
    if (level !== this._level) {
      this.level = level;
    }
  }

}

let volume = new Volume();
export default volume;
