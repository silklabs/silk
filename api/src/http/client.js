/**
 * This module provides additional functionality on top of core node http/https
 * functionality. This is intended to be somewhere between the usability of the
 * native http/https modules and fetch. Unlike most of the other silk-api code
 * this is intended to be a node only module.
 *
 * @flow
 */

 import type Readable from 'stream';

 export type RequestOptions = {
   method: string;
   body: Readable|Buffer;
 };

/**
 * Clients are dispatched from the centralized "manager" which can eventually keep
 * track of all our http traffic from the device.
 */
class Manager {
  request(url: string, options: Object) {
  }
}
