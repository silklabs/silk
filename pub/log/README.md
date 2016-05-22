# debug-log
Common conventions around using the debug module for logging.


## Usage:

```js

let log = require('./log')('coolfeature');

log.debug('assert(1+1=3)');
log.verbose('useless');
log.info('hi');
log.warn('tsktsk');
log.error('ono');
log.fatal('sos');
```
