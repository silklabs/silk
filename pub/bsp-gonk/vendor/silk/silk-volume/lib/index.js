/**
 * @private
 * @flow
 */

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
class Volume {
  /**
   * Gets the current volume level (0..100)
   *
   * @memberof silk-volume
   * @instance
   */
  get level(): number {
    return util.getintprop('persist.silk.volume.level', 0);
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
    util.setprop('persist.silk.volume.level', newlevel);
  }

  /**
   * Gets the current volume mute
   *
   * @memberof silk-volume
   * @instance
   */
  get mute(): boolean {
    return util.getboolprop('persist.silk.volume.mute', false);
  }

  /**
   * Sets the current volume mute
   *
   * @memberof silk-volume
   * @instance
   */
  set mute(newmute: boolean): void {
    util.setprop('persist.silk.volume.mute', newmute);
  }
}

let volume = new Volume();
export default volume;
