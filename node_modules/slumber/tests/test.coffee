#!/usr/bin/env coffee

querystring = require 'querystring'
url = require 'url'
assert = require 'assert'
express = require 'express'
connect = require 'connect'
freeport = require 'freeport'

slumber = require '..'

base_url = 'http://www.example.com/'


CUSTOMERS =
  1:
    user: 'Alfred'
    gender: 'male'
    age: 24
  2:
    user: 'George'
    gender: 'male'
    age: 42
  3:
    user: 'Cynthia'
    gender: 'female'
    age: 28


app = express()
app.use connect.urlencoded()
app.use connect.json()

app.get '/', (req, res) ->
   res.end 'Hello World !'

app.get '/test-headers', (req, res) ->
  res.json 'headers': req.headers

app.get '/customers', (req, res) ->
  url_parts = url.parse req.url
  query = querystring.parse url_parts.query

  ret = []
  for customer_id, customer of CUSTOMERS
    ok = true
    for filter_key, filter_value of query
      if customer[filter_key] != filter_value
        ok = false
        break
    if ok
      ret.push customer_id

  res.json ret

app.post '/test-post', (req, res) ->
  res.json 'parsed-body': req.body

app.put '/test-put', (req, res) ->
  res.json 'parsed-body': req.body

app.delete '/test-delete', (req, res) ->
  res.json 'test ok'

app.patch '/test-patch', (req, res) ->
  res.json 'parsed-body': req.body

app.get '/customers-yml', (req, res) ->
  yamljs = require 'yamljs'
  res.end yamljs.stringify CUSTOMERS

app.get '/customers-yml-with-header', (req, res) ->
  yamljs = require 'yamljs'
  res.header 'Content-Type', 'text/yaml'
  res.end yamljs.stringify CUSTOMERS

app.get '/customers/:id', (req, res) ->
  res.json CUSTOMERS[parseInt req.params.id]


describe 'Routing', ->
  api = slumber.API base_url, {}
  describe '#base_url', ->
    it 'should retrieve a string with base_url of api', ->
      assert.equal api.base_url, base_url

  describe 'one child', ->
    it 'should retrieve a string with base_url of api with 1 child', ->
      assert.equal api('customers').base_url, "#{base_url}customers/"

  describe 'two children', ->
    it 'should retrieve a string with base_url of api with 2 children', ->
      assert.equal api('customers')(42).base_url, "#{base_url}customers/42/"


describe 'Serializer', ->
  describe 'serializer', ->
    api = slumber.API base_url, {}
    it 'should be an object', ->
      assert.equal 'object', typeof api.serializer

    describe '#serializers', ->
      it 'should return an array of available serializers', ->
        assert.equal 'object', typeof api.serializer.serializers

    describe '#get_serializer()', ->
      it 'should return the default serializer', ->
        serializer = api.serializer.get_serializer()
        assert.equal 'object', typeof serializer
        assert.equal 'json', serializer.key

    describe '#get_by_name', ->
      it 'should return the best serializer depending on name', ->
        assert.equal 'yaml', api.serializer.get_serializer('yaml').key

    describe '#get_by_content_type', ->
      it 'should return the best serializer depending on content-type', ->
        mapping =
          'text/yaml': 'yaml'
          'application/json': 'json'
          'application/x-javascript': 'json'
          'text/javascript': 'json'
          'text/x-javascript': 'json'
          'text/x-json': 'json'
          'dontexists': null
        for k, v of mapping
          if v is null
            assert.throws (-> api.serializer.get_serializer(null, k)), /there is no available serializer for content-type/
          else
            assert.equal v, api.serializer.get_serializer(null, k).key

  describe 'YamlSerializer', ->
    api = slumber.API base_url, {'format': 'yaml'}
    serializer = api.serializer.get_serializer()

    describe '#constructor', ->
      it 'should be a valid Serializer', ->
        assert.equal 'object', typeof serializer
        assert.equal 'yaml', serializer.key

    describe '#loads', ->
      it 'should loads jyaml encoded string and return a javascript object', ->
        ret = serializer.loads 'a: 42\nb:\n  - 43\n  - 45\n'
        assert.equal 'object', typeof ret
        assert.equal ret.a, 42
        assert.equal ret.b.length, 2

    describe '#loads#error', ->
      it 'should raise an exception', ->
        assert.throws (-> serializer.loads 'a: 42\nb:\n  - 43\n     -\n')

    describe '#dumps', ->
      it 'should dumps a javascript object to a yaml encoded string', ->
        ret = serializer.dumps {a: 42, b: [43, 45]}
        assert.equal 'string', typeof ret
        assert.equal ret, 'a: 42\nb:\n  - 43\n  - 45\n'

  describe 'JsonSerializer', ->
    api = slumber.API base_url, {'format': 'json'}
    serializer = api.serializer.get_serializer()

    describe '#constructor', ->
      it 'should be a valid Serializer', ->
        assert.equal 'object', typeof serializer
        assert.equal 'json', serializer.key

    describe '#loads', ->
      it 'should loads json encoded string and return a javascript object', ->
        ret = serializer.loads '{"a": 42, "b": [43, 45]}'
        assert.equal 'object', typeof ret
        assert.equal ret.a, 42
        assert.equal ret.b.length, 2

    describe '#loads#error', ->
      it 'should raise an exception', ->
        assert.throws (-> serializer.loads '{"a": 42, "b": [43, 45]')

    describe '#dumps', ->
      it 'should dumps a javascript object to a json encoded string', ->
        ret = serializer.dumps {a: 42, b: [43, 45]}
        assert.equal 'string', typeof ret
        assert.equal ret, '{"a":42,"b":[43,45]}'


  describe 'UnknownSerializer', ->
    describe '#constructor', ->
      it 'should be an empty Serializer', ->
        api = slumber.API base_url, {'format': 'dontexists'}
        serializer = api.serializer.get_serializer()
        # should raise ?
        assert.equal undefined, serializer


describe 'Local Express', ->
  api = null
  port = null

  describe 'Authenticated', ->
    before (done) ->
      freeport (err, _port) ->
        port = _port
        app.listen port, ->
          do done

    it 'should send connection detail', (done) ->
      api = slumber.API "http://localhost:#{port}/", {auth: ['admin', 'secure']}, ->
        api('test-headers').get (err, ret) ->
          assert.equal err, null
          assert.equal ret.headers.authorization, 'Basic YWRtaW46c2VjdXJl'
          do done


  describe 'Anonymous', ->
    before (done) ->
      freeport (err, port) ->
        app.listen port, ->
          api = slumber.API "http://localhost:#{port}/", {}, ->
            do done

    describe 'Connection', ->
      it 'should connect to express and return a string Hello World', (done) ->
        api.get (err, ret) ->
          assert.equal err, null
          assert.equal ret, 'Hello World !'
          do done

      it 'should return an array (from json) of customers', (done) ->
        api('customers').get (err, ret) ->
          assert.equal err, null
          assert.equal 'object', typeof ret
          assert.equal ret.length, 3
          do done

      it 'should post data', (done) ->
        api('test-post').post {'user': 'Mickael', 'age': 42, 'gender': 'male'}, (err, ret) ->
          assert.equal err, null
          assert.equal 'object', typeof ret
          assert.equal ret['parsed-body'].user, 'Mickael'
          assert.equal ret['parsed-body'].age, 42
          assert.equal ret['parsed-body'].gender, 'male'
          do done

      it 'should put data', (done) ->
        api('test-put').put {'test': 42, 'test2': 'toto'}, (err, ret) ->
          assert.equal err, null
          assert.equal 'object', typeof ret
          assert.equal ret['parsed-body'].test, 42
          assert.equal ret['parsed-body'].test2, 'toto'
          do done

      it 'should patch data', (done) ->
        api('test-patch').patch {'test': 43, 'test2': 'titi'}, (err, ret) ->
          assert.equal err, null
          assert.equal 'object', typeof ret
          assert.equal ret['parsed-body'].test, 43
          assert.equal ret['parsed-body'].test2, 'titi'
          do done

      it 'should delete data', (done) ->
        api('test-delete').delete (err, ret) ->
          assert.equal err, null
          assert.equal ret, true
          do done

      it 'should return customer object (from json) with id = 1', (done) ->
        api('customers')(1).get (err, ret) ->
          assert.equal ret.user, CUSTOMERS[1].user
          assert.equal ret.age, CUSTOMERS[1].age
          assert.equal ret.gender, CUSTOMERS[1].gender
          do done

      it 'should return an array (from json) of customers for gender=male', (done) ->
        api('customers').get {'gender': 'male'}, (err, ret) ->
          assert.equal err, null
          assert.equal ret.length, 2
          do done

      it 'should return an array (from json) of customers for gender=male explicitely defining args', (done) ->
        api('customers').get {'__args': {'gender': 'male'}}, (err, ret) ->
          assert.equal err, null
          assert.equal ret.length, 2
          do done

      it 'should not detect yaml content-type and return an object', (done) ->
        api('customers-yml').get (err, ret) ->
          assert.equal null, err
          assert.equal 'string', typeof ret
          do done

      it 'should detect yaml content-type and return an object', (done) ->
        api('customers-yml-with-header').get (err, ret) ->
          assert.equal null, err
          assert.equal 'object', typeof ret
          assert.equal 'Alfred', ret[1].user
          do done

  describe 'Passing headers', ->
    headers =
      "X-AAA": 42
      "X-BBB": "test"
    headers_override =
      "X-AAA": 43
      "X-CCC": "hello"

    it 'should pass headers when calling method', (done) ->
      freeport (err, port) ->
        app.listen port, ->
          api = slumber.API "http://localhost:#{port}/", {}, ->
            api('test-headers').get {headers: headers}, (err, ret) ->
              assert.equal err, null
              assert.equal ret.headers['x-aaa'], '42'
              assert.equal ret.headers['x-bbb'], 'test'
              do done

    it 'should pass headers globally', (done) ->
      freeport (err, port) ->
        app.listen port, ->
          api = slumber.API "http://localhost:#{port}/", {headers: headers}, ->
            api('test-headers').get {}, (err, ret) ->
              assert.equal err, null
              assert.equal ret.headers['x-aaa'], '42'
              assert.equal ret.headers['x-bbb'], 'test'
              do done

    it 'should pass headers globally and override them when calling method', (done) ->
      freeport (err, port) ->
        app.listen port, ->
          api = slumber.API "http://localhost:#{port}/", {headers: headers}, ->
            api('test-headers').get {headers: headers_override}, (err, ret) ->
              assert.equal err, null
              assert.equal ret.headers['x-aaa'], '43'
              assert.equal ret.headers['x-bbb'], 'test'
              assert.equal ret.headers['x-ccc'], 'hello'
              do done

    it 'should have a default user-agent', (done) ->
      freeport (err, port) ->
        app.listen port, ->
          api = slumber.API "http://localhost:#{port}/", {}, ->
            api('test-headers').get {}, (err, ret) ->
              assert.equal err, null
              defaultVersion = require('../package.json').version
              targetVersion = "node-slumber/#{defaultVersion}"
              assert.equal ret.headers['user-agent'], targetVersion
              do done

    it 'should override user-agent globally', (done) ->
      freeport (err, port) ->
        app.listen port, ->
          api = slumber.API "http://localhost:#{port}/", {headers: {'user-agent': 'test'}}, ->
            api('test-headers').get {}, (err, ret) ->
              assert.equal err, null
              assert.equal ret.headers['user-agent'], 'test'
              do done

    it 'should override user-agent globally using capitalize', (done) ->
      freeport (err, port) ->
        app.listen port, ->
          api = slumber.API "http://localhost:#{port}/", {headers: {'User-Agent': 'test'}}, ->
            api('test-headers').get {}, (err, ret) ->
              assert.equal err, null
              assert.equal ret.headers['user-agent'], 'test'
              do done

    it 'should override user-agent when calling method', (done) ->
      freeport (err, port) ->
        app.listen port, ->
          api = slumber.API "http://localhost:#{port}/", {}, ->
            api('test-headers').get {headers: {'User-Agent': 'test'}}, (err, ret) ->
              assert.equal err, null
              assert.equal ret.headers['user-agent'], 'test'
              do done


describe 'Rare cases', ->
  api = null

  describe 'Non existing remote host', ->
    api = slumber.API 'http://alskdjgalskdjgalskdjgalskdjgalskdgj.com', {}
    it 'should raise an handled error', (done) ->
      api('lkasdjglaksdjglkasdjglkasdjglkasdg').get (err, ret) ->
        assert.equal ret, null
        assert.equal err.code, 'ENOTFOUND'
        assert.equal err.errno, 'ENOTFOUND'
        do done

  describe 'Call method without callback', ->
    api = slumber.API 'http://alskdjgalskdjgalskdjgalskdjgalskdgj.com', {}
    it 'should raise an exception', ->
      assert.throws (->
          api('lkasdjglaksdjglkasdjglkasdjglkasdg').get()
        ), Error
