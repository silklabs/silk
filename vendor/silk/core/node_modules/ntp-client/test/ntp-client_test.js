/*
 ======== A Handy Little Nodeunit Reference ========
 https://github.com/caolan/nodeunit

 Test methods:
 test.expect(numAssertions)
 test.done()
 Test assertions:
 test.ok(value, [message])
 test.equal(actual, expected, [message])
 test.notEqual(actual, expected, [message])
 test.deepEqual(actual, expected, [message])
 test.notDeepEqual(actual, expected, [message])
 test.strictEqual(actual, expected, [message])
 test.notStrictEqual(actual, expected, [message])
 test.throws(block, [error], [message])
 test.doesNotThrow(block, [error], [message])
 test.ifError(value)
 */

(function (exports) {
    "use strict";

    var ntpClient = require('../lib/ntp-client.js');

    exports.setUp = function (done) {
        // setup here
        ntpClient.ntpReplyTimeout = 5000; // Reducing timeout to avoid warnings.
        done();
    };

    exports.invalidUsage = function (test) {
        test.doesNotThrow(function () {
            ntpClient.getNetworkTime(ntpClient.defaultNtpServer, ntpClient.defaultNtpPort);
        });

        test.done();
    };

    exports.notBitchyAboutSomeParameters = function (test) {
        ntpClient.getNetworkTime(null, null, function (err, date) {
            test.ok(date !== null);
            test.done();
        });
    };

    exports.validNTPServer = function (test) {
        ntpClient.getNetworkTime(ntpClient.defaultNtpServer, ntpClient.defaultNtpPort, function (err, date) {
            console.log();
            console.log("System reported : %s", new Date());

            test.ok(err === null);
            test.ok(date !== null);

            console.log("NTP Reported : %s", date);

            // I won't test returned datetime against the system datetime
            // this is the whole purpose of NTP : putting clocks in sync.
            test.done();
        });

    };

    exports.invalidNTPServer = function (test) {
        // I'm pretty sure there is no NTP Server listening at google.com
        ntpClient.getNetworkTime("google.com", 123, function (err, date) {
            test.ok(err !== null);
            test.ok(date === null);
            test.equal(err, "Timeout waiting for NTP response.");
            test.done();
        });
    };
}(exports));
