'use strict';

var test = require("tap").test;
var Raygun = require('../lib/raygun.js');

// need to get these working, they time out for some reason, despite the call succeeding

test('send basic', {skip: true}, function (t) {
    t.plan(1);
    var client = new Raygun.Client().init({apiKey: process.env['RAYGUN_APIKEY']});
    client.send(new Error(), {}, function (response) {
        t.equals(response.statusCode, 202);
    });
});

test('send complex', {skip: true}, function (t) {
    t.plan(1);
    var client = new Raygun.Client().init({apiKey: process.env['RAYGUN_APIKEY']}).setUser("callum@mindscape.co.nz").setVersion("1.0.0.0");

    client.send(new Error(), {}, function (response) {
        t.equals(response.statusCode, 202);
    });
});

test('send with OnBeforeSend', {skip: true}, function (t) {
    t.plan(1);
    var client = new Raygun.Client().init({apiKey: process.env['RAYGUN_APIKEY']});

    var onBeforeSendCalled = false;
    client.onBeforeSend(function (payload) {
        return payload;
    });

    client.send(new Error(), {}, function () {
        t.equals(onBeforeSendCalled, true);
        t.end();
    });
});

test('check that tags get passed through', {}, function (t) {
    var tag = ['Test'];
    var client = new Raygun.Client().init({apiKey: 'TEST'});

    client.setTags(tag);

    client.onBeforeSend(function (payload) {
        t.same(payload.details.tags, tag);
        t.end();
    });

    client.send(new Error(), {}, function () {
        t.end();
    });
});

test('check that tags get merged', {}, function (t) {
    var client = new Raygun.Client().init({apiKey: 'TEST'});
    client.setTags(['Tag1']);

    client.onBeforeSend(function (payload) {
        t.same(payload.details.tags, ['Tag1', 'Tag2']);
        t.end();
    });

    client.send(new Error(), {}, function () {
        t.end();
    }, null, ["Tag2"]);
});