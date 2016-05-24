# Raygun4Node

[![Build Status](https://travis-ci.org/MindscapeHQ/raygun4node.svg?branch=master)](https://travis-ci.org/MindscapeHQ/raygun4node)

Raygun.io plugin for Node

## Getting Started
Install the module with: `npm install raygun`

```javascript
var raygun = require('raygun');
var raygunClient = new raygun.Client().init({ apiKey: 'your API key' });
raygunClient.send(theError);

// For express, at the end of the middleware definitions, just above app.listen:
app.use(raygunClient.expressHandler);
```

### Expressjs 4.0 and above

The [Express documentation](http://expressjs.com/guide/error-handling.html) says `Though not strictly required, by convention you define error-handling middleware last, after other app.use() calls`, but that is incorrect. If the `app.use(raygunClient.expressHandler);` call is not immediately before the `app.listen` call, then errors will not be handled by Raygun.

## Documentation

### Sending custom data

You can pass custom data in on the Send() function, as the second parameter. For instance (based off the call in test/raygun_test.js):

```javascript
client.send(new Error(), { 'mykey': 'beta' }, function (response){ });
```

### Callback

```javascript
client.send(new Error(), {}, function (response){ });
```

The argument to the 3rd argument callback is the response from the Raygun API - there's nothing in the body, it's just a status code response. If everything went ok, you'll get a 202 response code. Otherwise we throw 401 for incorrect API keys, 403 if you're over your plan limits, or anything in the 500+ range for internal errors. We use the nodejs http/https library to make the POST to Raygun, you can see more documentation about that callback here: https://nodejs.org/api/http.html#http_http_request_options_callback

### Sending request data

You can send the request data in the Send() function, as the fourth parameter. For example:
```javascript
client.send(new Error(), {}, function () {}, request);
```

If you want to filter any of the request data then you can pass in an array of keys to filter when
you init the client. For example:
```javascript
var raygun = require('raygun');
var raygunClient = new raygun.Client().init({ apiKey: 'your API key', filters: ['password', 'creditcard'] });
```

### Tags

You can add tags to your error in the Send() function, as the fifth parameter. For example:
```javascript
client.send(new Error(), {}, function () {}, {}, ['custom tag 1', 'important error']);
```

Tags can also be set globally using setTags

```javascript
client.setTags(['Tag1', 'Tag2']);
```

### Affected user tracking

New in 0.4: You can set **raygunClient.user** to a function that returns the user name or email address of the currently logged in user.

An example, using the Passport.js middleware:

```javascript
var raygunClient = new raygun.Client().init({apiKey: "yourkey"});

raygunClient.user = function (req) {
  if (req.user) {
    return req.user.username;
  }
}
```

####raygunClient.user(req)

**Param**: *req*: the current request.
**Returns**: The current user's identifier, or an object that describes the user.

This will be transmitted with each message sent, and a count of affected users will appear on the dashboard in the error group view. If you return an email address, and the user has associated a Gravatar with it, their picture will be also displayed.

If you return an object, it may have any of the following properties (only identifier is required):

`identifier` is the user identifier. This will be used to uniquely identify the user within Raygun. This is the only required parameter, but is only required if you are using user tracking.

`isAnonymous` is a bool indicating whether the user is anonymous or actually has a user account. Even if this is set to true, you should still give the user a unique identifier of some kind.

`email` is the user's email address.

`fullName` is the user's full name.

`firstName` is the user's first or preferred name.

`uuid` is the identifier of the device the app is running on. This could be used to correlate user accounts over multiple machines.

Any other properties will be discarded.

**Note:** setUser deprecated in 0.4

Release 0.3 previously had a setUser function that accepted a string or function to specify the user, however it did not accept arguments. This method is considered deprecated and will be removed in the 1.0 release, thus it is advised to update your code to set it with the new *user* function.

### Version tracking

Call setVersion(*string*) on a RaygunClient to set the version of the calling application. This is expected to be of the format x.x.x.x, where x is a positive integer. The version will be visible in the dashboard.

### Changing the API endpoint

You can change the endpoint that error messages are sent to by specifying the `host`, `port`, and `useSSL` properties in the `raygunClient.init()` options hash. By default, `host` is `api.raygun.io`, `port` is `443`, and `useSSL` is `true`.

### onBeforeSend

Call `Raygun.onBeforeSend()`, passing in a function which takes up to 5 parameters (see the example below). This callback function will be called immediately before the payload is sent. The first parameter it gets will be the payload that is about to be sent. Thus from your function you can inspect the payload and decide whether or not to send it.

You can also pass this in as an option to `init()` like this: `raygunClient.init({ onBeforeSend: function(payload) { return payload; } });`

From the supplied function, you should return either the payload (intact or mutated as per your needs), or false.

If your function returns a truthy object, Raygun4Node will attempt to send it as supplied. Thus, you can mutate it as per your needs - preferably only the values if you wish to filter out data that is not taken care of by the filters. You can also of course return it as supplied.

If, after inspecting the payload, you wish to discard it and abort the send to Raygun, simply return false.

By example:

    var myBeforeSend = function (payload, exception, customData, request, tags) {
      console.log(payload); // Modify the payload here if necessary
      return payload; // Return false here to abort the send
    }

    Raygun.onBeforeSend(myBeforeSend);

### Offline caching

Raygun can cache errors thrown by your Node application when it's running in 'offline' mode. By default the offline cache is disabled. Raygun4Node doesn't detect network state change, that is up to the application using the library.

Raygun includes an on-disk cache provider out of the box, which required write permissions to the folder you wish to use. You cal also pass in your own cache storage.

##### Getting setup with the default offline provider

When creating your Raygun client you need to pass through a cache path

    var raygunClient = new raygun.Client().init(
        {
            apiKey: 'API-KEY',
            isOffline: false,
            offlineStorageOptions: {
              cachePath: 'raygunCache/',
              cacheLimit: 1000 // defaults to 100 errors if you don't set this
            }
        }
    );

##### Changing online/offline state

The Raygun client allows you to set it's online state when your application is running.

*To mark as offline*

    raygunClient.offline();

*To mark as online*

    raygunClient.online();

When marking as online any cached errors will be forwarded to Raygun.

##### Custom cache provider

You're able to provide your own cache provider if you can't access to the disk. When creating your Raygun client, pass in the storage provider on the offlineStorage property

Example:

     var sqlStorageProvider = new SQLStorageProvider();

     var raygunClient = new raygun.Client().init(
            {
                apiKey: 'API-KEY',
                isOffline: false,
                offlineStorage: sqlStorageProvider,
                offlineStorageOptions: {
                    table: 'RaygunCache'
                }
            }
        );

*Required methods*

* init(offlineStorageOptions) - Called when Raygun is marked as offline. offlineStorageOptions is an object with properties specific to each offline provider
* save(transportItem, callback) - Called when marked as offline
* retrieve(callback) - Returns an array of cached item filenames/ids
* send(callback) - Sends the backlog of errors to Raygun

See [lib/raygun.offline.js](lib/raygun.offline.js) for an example.

We recommend that you limit the number of errors that you are caching so that you don't swamp the clients internet connection sending errors.

### Custom error grouping

You can provide your own grouping key if you wish. We only recommend this you're having issues with errors not being grouped properly.

When initializing Raygun, pass through a `groupingKey` function.

    var raygunClient = new raygun.Client().init({
        apiKey: 'YOUR_KEY',
        groupingKey: function(message, exception, customData, request, tags) {
            return "CUSTOMKEY";
        }
    });

### Examples
View a screencast on creating an app with Node.js and Express.js, then hooking up the error handling and sending them at [http://raygun.io/blog/2013/07/video-nodejs-error-handling-with-raygun/](http://raygun.io/blog/2013/07/video-nodejs-error-handling-with-raygun/)

## Contributing
In lieu of a formal styleguide, take care to maintain the existing coding style. Add unit tests for any new or changed functionality. Lint and test your code using "npm test".

## Release History

- 0.8.3 - Turn strings into errors if passed through. Log out request errors.
- 0.8.2 - Add setTags method
- 0.8.1 - Add custom error grouping key
- 0.8.0 - Add offline support
- 0.7.1 - Default useSSL to true
- 0.7.0 - Add onBeforeSend hook, api endpoint options, and bug fixes
- 0.6.2 - Fix utf8 chars causing 400s, log when errors occur when posting
- 0.6.1 - Replace deprecated request.host with request.hostname if it exists
- 0.6.0 - Added ability to send tags with exception reports
- 0.5.0 - Added filters for sensitive request data, and better affected user tracking
- 0.4.2 - Minor test refactor
- 0.4.1 - Fixed issue where getting cpu information returned undefined
- 0.4.0 - Added *user* function, deprecated setUser
- 0.3.0 - Added version and user tracking functionality; bump jshint version, update test
- 0.2.0 - Added Express handler, bug fixes
- 0.1.2 - Include more error information
- 0.1.1 - Point at the correct API endpoint, include correct dependencies for NPM
- 0.1.0 - Initial release

## License
Copyright (c) 2015 MindscapeHQ
Licensed under the MIT license.
