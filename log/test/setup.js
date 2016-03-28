// XXX: Hack to enable android log formatting for tests.
process.env.SILK_ANDROID_LOGS = 1;
require('babel/register')(
  {
    "breakConfig": true,
    "stage": "1",
    "optional": ["regenerator", "asyncToGenerator", "es7.classProperties"]
  }
);
