// XXX: Sorta a hack but not worth it to avoid using babel when the rest of our
// internal code does.
require('../../pub/babel-run/mocha');

require('./multiconnect');
require('./bwtest').tape();
