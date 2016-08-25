/**
 * A more advanced type checking for EventEmitter type objects.
 *
 * Sadly this only works well with the "declare" syntax and not inline flow
 * definitions...
 *
 * @flow
 * @providesModule typed-events
 */

declare export default class EventEmitter {
  // NOTE: You may notice that on/once/addListener are all missing this is
  // due to a missing feature in flow: https://github.com/facebook/flow/issues/2242
  // which would allow us to provide generic interface for EventEmitters.
  emit(event: string, ...args:Array<any>): boolean;
  listeners(event: string): Array<Function>;
  listenerCount(event: string): number;
  removeAllListeners(event?: string): this;
  removeListener(event: string, listener: Function): this;
  setMaxListeners(n: number): void;
  getMaxListeners(): number;
}
