# mic
A simple stream wrapper for arecord (Linux (including Raspbian)) and sox (Mac/Windows). Returns a Mic object that supports a flexible API to control: start, stop, pause, resume functionality. Also it provides access to the audioStream object that provides evented notifications for 'startComplete', 'stopComplete', 'pauseComplete', 'resumeComplete', 'silence' and 'processExitComplete'. You can use this signals to control various states.

This is a cross platform library that has been tested on both my MacbookPro as well as my Raspberry Pi and it works very well on both these platforms. I haven't tested this on Windows, but it should work as long as you have installed either sox OR alsa tools. Here are my node versions on raspberry pi:

```
$ npm version
{ mic: '2.0.0',
  npm: '3.3.12',
  ares: '1.10.1-DEV',
  http_parser: '2.6.0',
  icu: '56.1',
  modules: '47',
  node: '5.3.0',
  openssl: '1.0.2e',
  uv: '1.7.5',
  v8: '4.6.85.31',
  zlib: '1.2.8' }
```

Installation
============
This module depends on your machine having an installation of sox (Mac/Windows Users) OR ALSA tools for Linux. You can use this library to record from any microphone device.
Before installing and experimenting with the mic module, you need to ensure that you are able to capture audio via the command line:

```
$ arecord temp.wav
```
OR
```
$ rec temp.wav
```
To get ALSA tools on Raspberry Pi running raspbian, try the following:
```
$ sudo apt-get update
$ sudo apt-get upgrade
$ sudo apt-get install alsa-base alsa-utils
```

After the above is tested and validated, you can proceed to install the module using:

```
$ npm install mic
```

API
============
Below is an example of how to use the module. 
```javascript
var mic = require('mic');
var fs = require('fs');

var micInstance = mic({ 'rate': '16000', 'channels': '1', 'debug': true, 'exitOnSilence': 6 });
var micInputStream = micInstance.getAudioStream();

var outputFileStream = fs.WriteStream('output.raw');

micInputStream.pipe(outputFileStream);

micInputStream.on('data', function(data) {
    console.log("Recieved Input Stream: " + data.length);
});

micInputStream.on('error', function(err) {
    cosole.log("Error in Input Stream: " + err);
});

micInputStream.on('startComplete', function() {
        console.log("Got SIGNAL startComplete");
        setTimeout(function() {
                micInstance.pause();
            }, 5000);
    });
    
micInputStream.on('stopComplete', function() {
        console.log("Got SIGNAL stopComplete");
    });
    
micInputStream.on('pauseComplete', function() {
        console.log("Got SIGNAL pauseComplete");
        setTimeout(function() {
                micInstance.resume();
            }, 5000);
    });

micInputStream.on('resumeComplete', function() {
        console.log("Got SIGNAL resumeComplete");
        setTimeout(function() {
                micInstance.stop();
            }, 5000);
    });

micInputStream.on('silence', function() {
        console.log("Got SIGNAL silence");
    });

micInputStream.on('processExitComplete', function() {
        console.log("Got SIGNAL processExitComplete");
    });

micInstance.start();
```

You should be able to playback the output file using. Note that arecord pipes the 44 byte WAV header, whereas SOX does NOT add any header. So we need to provide the file format details to the player:

```
$ aplay -f S16_LE -r 16000 -c 1 output.raw
```
OR
```
$ play -b 16 -e signed -c 1 -r 16000 output.raw
```

### mic(options)
Returns a microphone object instance that can be used to control the streaming samples coming in from the specified device.
* `options` - JSON containing command line options. Following are valid options:
    * `endian`: `big` OR `little`, default: `little`
    * `bitwidth`: `8` OR `16` OR `24` OR anything valid supported by arecord OR sox, default: `16`
    * `encoding`: `signed-integer` OR `unsinged-integer` (none of the other encoding formats are supported), default:`signed-integer`
    * `rate`: `8000` OR `16000` OR `44100` OR anything valid supported by arecord OR sox, default: `16000`
    * `channels`: `1` OR `2` OR anything valid supported by arecord OR sox, default: `1` (mono)
    * `device`: `hw:0,0` OR `plughw:1, 0` OR anything valid supported by arecord. Ignored for sox on macOS.
    * `exitOnSilence`: The `'silence'` signal is raised after reaching these many consecutive frames, default: '0'
    * `debug`: true OR false - can be used to aide in debugging

### mic.start()
This instantiates the process `arecord` OR `sox` using the options specified

### mic.stop()
This kills the arecord OR sox process that was started in the start() routine. It uses the `SIGTERM` signal.

### mic.pause()
This pauses the arecord OR sox process using the `SIGSTOP` signal.

### mic.resume()
This resumes the arecord OR sox process using the `SIGCONT` signal.

### mic.getAudioStream()
This returns a simple Transform stream that contains the data from the arecord OR sox process. This sream can be directly piped to a speaker sream OR a file stream. Further this provides a number of events triggered by the state of the stream:
* `'silence'`: This is emitted once when `exitOnSilence` number of consecutive frames of silence are found
* `'processExitComplete'`: This is emitted once the arecord OR sox process exits
* `'startComplete'`: This is emitted once the start() function is successfully executed
* `'stopComplete'`: This is emitted once the stop() function is successfully executed
* `'pauseComplete'`: This is emitted once the pause() function is successfully executed
* `'resumeComplete'`: This is emitted once the resume() function is successfully executed
* It further inherits all the Events from [stream.Transform](http://nodejs.org/api/stream.html#stream_class_stream_transform)


License
==========
The MIT License (MIT)

Copyright (c) 2016 Ashish Bajaj bajaj.ashish@gmail.com

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
