var mic = require('../index.js');
var fs = require('fs');

var micInstance = mic({ 'rate': '16000', 'channels': '1', 'debug': false });
var micInputStream = micInstance.getAudioStream();

var outputFileStream = fs.WriteStream('output.raw');

micInputStream.pipe(outputFileStream);

var chunkCounter = 0;
micInputStream.on('data', function(data) {
        console.log("Recieved Input Stream of Size %d: %d", data.length, chunkCounter++);
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


