Common conventions around using the debug module for logging.

### Usage:

```js
const log = require('silk-log')('coolfeature');

log.verbose('useless');
log.debug('assert(1+1=3)');
log.info('hi');
log.warn('tsktsk');
log.error('ono');
log.fatal('sos');
```

To enable output call the `configureLog` function or set the `DEBUG` environment variable,
