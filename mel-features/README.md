# Mel Feature Extractor

```JavaScript
    var FFT_SIZE = 512;
    var STEP_SIZE = FFT_SIZE/2;
    var SAMPLE_RATE = 16000;

    var mfcc = require('mel-features');
    var mel = new mfcc.MelFeatureExtractor(26, SAMPLE_RATE, FFT_SIZE);
    var framer = new Framer(STEP_SIZE, FFT_SIZE, window => {
        mel.process(window);
    });
    ...
    stream.ondata(data => framer.addData(data));
    ...
```
