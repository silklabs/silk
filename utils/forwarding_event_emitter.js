/**
 * A forwarding EventEmitter.
 *
 * @flow
 */

import invariant from 'assert';
import EventEmitter from 'events';

type ForwardingFunctions = {
  add: () => void;
  remove: () => void;
};

const EVENT_NAME_ADD = `newListener`;
const EVENT_NAME_REMOVE = `removeListener`;

const forwarderMap: WeakMap<ForwardingEventEmitter, ForwardingFunctions> =
  new WeakMap();

export default class ForwardingEventEmitter extends EventEmitter {

  constructor(target: EventEmitter) {
    invariant(target);
    invariant(target instanceof EventEmitter);

    super();

    const forwarders: ForwardingFunctions = {
      add: () => {
        this.on(EVENT_NAME_ADD, (event, listener) => {
          target.addListener(event, listener);
        });
      },
      remove: () => {
        this.on(EVENT_NAME_REMOVE, (event, listener) => {
          target.removeListener(event, listener);
        });
      },
    };

    forwarderMap.set(this, forwarders);

    // Forward events directly to target.
    forwarders.add();
    forwarders.remove();
  }

  removeAllListeners(event?: string): EventEmitter {

    // EventEmitter.removeAllListeners() checks |arguments.length| explicitly so
    // can't pass |event| through if it is null/undefined.
    if (event) {
      super.removeAllListeners(event);
    } else {
      super.removeAllListeners();
    }

    let forwarders: ?ForwardingFunctions;

    if (!event || event === EVENT_NAME_ADD) {
      forwarders = forwarderMap.get(this);
      invariant(forwarders);
      forwarders.add();
    }

    if (!event || event === EVENT_NAME_REMOVE) {
      if (!forwarders) {
        forwarders = forwarderMap.get(this);
        invariant(forwarders);
      }
      forwarders.remove();
    }

    return this;
  }

}
