var Transform = require('stream').Transform;
var util = require("util");

function IsSilence(options) {
    var that = this;
    Transform.call(that, options);
    var consecSilenceCount = 0;
    var numSilenceFramesExitThresh = 0;

    that.getNumSilenceFramesExitThresh = function getNumSilenceFramesExitThresh() {
        return numSilenceFramesExitThresh;
    };

    that.getConsecSilenceCount = function getConsecSilenceCount() {
        return consecSilenceCount;
    };

    that.setNumSilenceFramesExitThresh = function setNumSilenceFramesExitThresh(numFrames) {
        numSilenceFramesExitThresh = numFrames;
        return;
    };

    that.incrConsecSilenceCount = function incrConsecSilenceCount() {
        consecSilenceCount++;
        return consecSilenceCount;
    };

    that.resetConsecSilenceCount = function resetConsecSilenceCount() {
        consecSilenceCount = 0;
        return;
    };
};
util.inherits(IsSilence, Transform);

IsSilence.prototype._transform = function(chunk, encoding, callback) {
    var i;
    var speechSample;
    var silenceLength = 0;
    var self = this;
    var consecutiveSilence = self.getConsecSilenceCount();
    var numSilenceFramesExitThresh = self.getNumSilenceFramesExitThresh();
    var incrementConsecSilence = self.incrConsecSilenceCount;
    var resetConsecSilence = self.resetConsecSilenceCount;

    if(numSilenceFramesExitThresh) {
        for(i=0; i<chunk.length; i=i+2) {
            if(chunk[i+1] > 128) {
                speechSample = (chunk[i+1] - 256) * 256;
            } else {
                speechSample = chunk[i+1] * 256;
            }
            speechSample += chunk[i];

            if(Math.abs(speechSample) > 2000) {
                console.log("Found speech block");
                resetConsecSilence();
                break;
            } else {
                silenceLength++;
            }

        }
        if(silenceLength == chunk.length/2) {
            consecutiveSilence = incrementConsecSilence();
            console.log("Found silence block: %d of %d", consecutiveSilence, numSilenceFramesExitThresh);
            //emit 'silence' only once each time the threshold condition is met
            if( consecutiveSilence === numSilenceFramesExitThresh) {
                self.emit('silence');
            }
        }
    }
    this.push(chunk);
    callback();
};

module.exports = IsSilence;