<a href="http://promises-aplus.github.com/promises-spec">
    <img src="http://promises-aplus.github.com/promises-spec/assets/logo-small.png"
         align="right" alt="Promises/A+ logo" />
</a>

# promised-mongo

A complete rewrite of [mongojs](https://github.com/mafintosh/mongojs) to support promises.  In a
break with previous versions, this library only supports promises, and not callbacks.


## Install

promised-mongo is available through [npm](http://npmjs.org):

	npm install promised-mongo


## Compatability with previous versions

I no longer use [Q](https://github.com/kriskowal/q) for promises.  This means that you can't  use
`.done()` at the end of promise chains.  To turn on compatability with previous versions, you can
call the `compatible()` function:

```js
var pmongo = require('promised-mongo').compatible();
```

Other than dropping support for callbacks, I have tried to make sure that the new library is
compatible with the old tests (see the legacy_tests folder).


## How I write JavaScript

I like using [async functions](https://github.com/lukehoban/ecmascript-asyncawait) from current
EMCAScript proposals.  This makes node amazingly easier to understand.  An example from the tests:

```js
it('returns all documents', async function () {
  let docs = [{hello: 'world'}, {hello: 'kitty'}];
  await collection.insert(docs);
  let cursor = collection.find();
  expect(cursor).to.be.an.instanceof(Cursor);
  let result = await cursor.toArray();
  expect(result).to.deep.have.members(docs);
});
```

Isn't it so much easier to understand?  The downsides (of course there had to be some) is that since
this is so bleeding edge, editor support and debugging support are varied and patchy, and there's a
chance that the feature won't even make it to the final language specification.

This is compiled to ES5 using [babel](https://babeljs.io/).


## Documentation

The documentation below refers to an older version.  Most of it should still work the same however.
Watch this space for improvements.


## Usage

Use promised-mongo just like mongojs, except that you use the returned promise instead of a
callback.

```js
var pmongo = require('promised-mongo');
var db = pmongo(connectionString, [collections]);
```

The connection string should follow the format desribed in
[the mongo connection string docs](http://docs.mongodb.org/manual/reference/connection-string/).
Some examples of this could be:

``` js
// simple usage for a local db
var db = pmongo('mydb', ['mycollection']);

// the db is on a remote server (the port default to mongo)
var db = pmongo('example.com/mydb', ['mycollection']);

// we can also provide some credentials
var db = pmongo('username:password@example.com/mydb', ['mycollection']);

// connect now, and worry about collections later
var db = pmongo('mydb');
var mycollection = db.collection('mycollection');
```

After we connected we can query or update the database just how we would using the mongo API with the exception that the functions return
a promise for the result rather than the result itself.  Cursor operations such as `find()` and `sort()` return a **cursor**; to get a
promise for the result, you have to force evaluation using `toArray()`.  Alternatively, you can just call `then()` on the cursor and it will call `toArray()` for you, returning a promise.  The function `findOne()` returns a promise immediately, not a cursor.
Note that due to [limitations in the Q promise library](https://github.com/kriskowal/q/#the-end), you should call `.done()` at the end of
any promise chain you aren't returning, in order to throw any uncaught exceptions.  For brevity, the examples in this readme don't do that.

``` js
// find everything
db.mycollection.find().toArray().then(function(docs){
	// docs is an array of all the documents in mycollection
});

// find everything, but sort by name
db.mycollection.find().sort({name:1}).toArray().then(function(docs) {
	// docs is now a sorted array
});

// find a document using a native ObjectId
db.mycollection.findOne({
	_id: pmongo.ObjectId('523209c4561c640000000001')
}).then(function(doc) {
	// doc._id.toString() === '523209c4561c640000000001'
});

// find all named 'mathias' and increment their level
db.mycollection.update({name:'mathias'}, {$inc:{level:1}}, {multi:true})
	.then(function(lastErrorObject) {
		// the update is complete
	});

// find one named 'mathias', tag him as a contributor and return the modified doc
db.mycollection.findAndModify({
	query: { name: 'mathias' },
	update: { $set: { tag:'maintainer' } },
	new: true
})
.then(function(doc) {
	// doc.tag === 'maintainer'
});

// use the save function to just save a document
db.mycollection.save({created:'just now'});

```

The `forEach` function is a special case.  The library supports the mongojs style:

``` js
// iterate over all whose level is greater than 90.
db.mycollection.find({level:{$gt:90}}).forEach(function(err, doc) {
	if (doc) {
      //do things with doc
    } else {
      //the callback gets called at the end with a null doc
      console.log('Finished!');
    }
});
```

It also supports a promise version.  If you pass a callback to the `forEach` function with only one argument, you get the promise version.  The promise will resolve (with `undefined`) when the callback has been called for all documents.

``` js
// iterate over all whose level is greater than 90 (promise version)
db.mycollection.find({level:{$gt:90}}).forEach(function(doc) {
	//do things with doc
})
.then(function () {
  console.log('Finished!');
});
```

To access `lastErrorObject` returned by `findAndModify` using the promises API, use the `findAndModifyEx` function:

```
db.mycollection.findAndModifyEx({
	query: { name: 'mathias' },
	update: { $set: { tag:'maintainer' } },
	new: true
})
.then(function(result) {
	var doc = result.result;
	var lastErrorObject = result.lastErrorObject;
});
```

If you provide a callback to `find` or any cursor config operation mongojs will call `toArray` for you

``` js
db.mycollection.find({}, function(err, docs) { ... });

db.mycollection.find({}).limit(2).skip(1, function(err, docs) { ... });
```
is the same as

``` js
db.mycollection.find({}).toArray(function(err, docs) { ... });

db.mycollection.find({}).limit(2).skip(1).toArray(function(err, docs) { ... });
```

If you are using the promises API, **you must call toArray() on cursors** before a promise can be obtained.  E.g.:

```
db.mycollection.find().limit(2).skip(1).toArray()
	.then(function (docs) {
		// ...
	});
```

For more detailed information about the different usages of update and querying see [the mongo docs](http://www.mongodb.org/display/DOCS/Manual)

## Streaming cursors

As of `0.7.0` all cursors are a [readable stream](http://nodejs.org/api/stream.html#stream_readable_stream) of objects.

``` js
var JSONStream = require('JSONStream');

// pipe all documents in mycollection to stdout
db.mycollection.find({}).pipe(JSONStream.stringify()).pipe(process.stdout);
```

Notice that you should pipe the cursor through a stringifier (like [JSONStream](https://github.com/dominictarr/JSONStream))
if you want to pipe it to a serial stream like a http response.

## Tailable cursors

If you are using a capped collection you can create a [tailable cursor](http://docs.mongodb.org/manual/tutorial/create-tailable-cursor/) to that collection by adding `tailable:true` to the find options

``` js
var cursor = db.mycollection.find({}, {}, {tailable:true, timeout:false});

// since all cursors are streams we can just listen for data
cursor.on('data', function(doc) {
	console.log('new document', doc);
});
```

Note that you need to explicitly set the selection parameter in the `find` call.

## Database commands

With promised-mongo you can run database commands just like with the mongo shell using `db.runCommand()`

```js
db.runCommand({ping:1}).then(function(res) {
	if(res.ok) console.log("we're up");
}).catch(function(err){
	if(err) console.log("we aren't up", err);
});
```

or `db.collection.runCommand()`

```js
db.things.runCommand('count').then(function(res) {
	console.log(res);
});
```

## Replication Sets

Promised-mongo can also connect to a mongo replication set by providing a connection string with multiple hosts

``` js
var db = pmongo('rs-1.com,rs-2.com,rs-3.com/mydb?slaveOk=true', ['mycollection']);
```

For more detailed information about replica sets see [the mongo replication docs](http://www.mongodb.org/display/DOCS/Replica+Sets)

# API

This API documentation is a work in progress.  To maintain compatibility with mongojs,
all functions can accept a callback.  If no callback is specified, a promise is returned.

#### Collection

#####`db.collection.aggregate([pipeline], callback)`

#####`db.collection.count([query], callback)`

#####`db.collection.createIndex(keys, options, [callback])`

#####`db.collection.distinct(field, query, callback)`

#####`db.collection.drop([callback])`

#####`db.collection.dropIndex(index, [callback])`

#####`db.collection.dropIndexes([callback])`

#####`db.collection.ensureIndex(keys, options, [callback])`

#####`db.collection.find([criteria], [projection], [callback])`

This function applies a query to a collection. You can get the return value, which is a cursor, or pass a callback
as the last parameter. Said callback receives `(err, documents)`

#####`db.collection.findOne([criteria], [projection], callback)`

Apply a query and get one single document passed as a callback. The callback receives `(err, document)`

#####`db.collection.findAndModify(document, callback)`

#####`db.collection.getIndexes(callback)`

#####`db.collection.group(document, callback)`

#####`db.collection.insert(docOrDocs, callback)`

#####`db.collection.isCapped(callback)`

#####`db.collection.mapReduce(map, reduce, options, callback)`

#####`db.collection.reIndex(callback)`

#####`db.collection.remove(query, [justOne], [callback])`

#####`db.collection.runCommand(command, callback)`

#####`db.collection.save(doc, callback)`

#####`db.collection.stats(callback)`

#####`db.collection.update(query, update, [options], callback)`

#### Cursor

#####`cursor.batchSize(size, [callback])`

#####`cursor.count(callback)`

#####`cursor.explain(callback)`

#####`cursor.forEach(function)`

#####`cursor.limit(n, [callback])`

#####`cursor.map(function, [callback])`

#####`cursor.next(callback)`

#####`cursor.skip(n, [callback])`

#####`cursor.sort(sortOptions, [callback])`

#####`cursor.toArray(callback)`

#### Database

#####`db.addUser(document)`

#####`db.createCollection(name, options, [callback])`

#####`db.dropDatabase([callback])`

#####`db.eval(function, arguments)`

#####`db.getCollectionNames([callback])`

#####`db.getLastError([callback])`

#####`db.getLastErrorObj([callback])`

#####`db.removeUser(username, [callback])`

#####`db.runCommand(command, [callback])`

#####`db.stats([callback])`
