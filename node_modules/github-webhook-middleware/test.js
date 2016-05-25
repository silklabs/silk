var http = require('http'),
    crypto = require('crypto'),
    through2 = require('through2'),
    test = require('tape');

var GithubMiddleware = require('./');

function mkReq() {
    var req = through2();
    req.headers = {
        'x-hub-signature': 'bogus',
        'x-github-event': 'bogus',
        'x-github-delivery': 'bogus',
        'content-type': 'application/json'
    };
    return req;
}

function signBlob(key, blob) {
    return 'sha1=' +
        crypto.createHmac('sha1', key).update(blob).digest('hex');
}

test('Middleware constructor without full options throws', function(t) {
    t.plan(3);

    t.equal(typeof GithubMiddleware, 'function', 'handler exports a function');

    t.throws(GithubMiddleware, /must provide an options object/, 'throws if no options');

    t.throws(GithubMiddleware.bind(null, {}), /must provide a 'secret' option/, 'throws if no secret option');
});

test('Middleware accepts signed blob', function(t) {
    t.plan(2);

    var obj = { some: 'github', object: 'with', properties: true },
        json = JSON.stringify(obj),
        githubMiddleware = GithubMiddleware({ secret: 'bogus' }),
        req = mkReq(),
        res;

    req.headers['x-hub-signature'] = signBlob('bogus', json);
    req.headers['content-length'] = Buffer.byteLength(json);

    githubMiddleware(req, res, function(err) {
        t.error(err, 'should not throw error');
        t.deepEqual(req.body, obj);
    });

    process.nextTick(function() {
        req.end(json);
    });
});

test('Middleware rejects badly signed blob', function(t) {
    t.plan(3);

    var obj = { some: 'github', object: 'with', properties: true },
        json = JSON.stringify(obj),
        githubMiddleware = GithubMiddleware({ secret: 'bogus' }),
        req = mkReq(),
        res;

    req.headers['x-hub-signature'] = signBlob('bogus', json);
    // break signage by a tiny bit
    req.headers['x-hub-signature'] = '0' + req.headers['x-hub-signature'].substring(1);
    req.headers['content-length'] = Buffer.byteLength(json);

    githubMiddleware(req, res, function(err) {
        t.ok(err, 'got an error');
        t.equal(err.message, 'Invalid Signature', 'correct error message');
        t.equal(err.status, 403, 'correct error status code');
    });

    process.nextTick(function() {
        req.end(json);
    });
});
