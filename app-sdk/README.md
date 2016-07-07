# Silk SDK for iOS and Android

## Messages

The SDK and the app communicate via simple JSON-like messages. For a list of
messages, see https://github.com/silklabs/release-pando-app/wiki/Pando---Silk-API.


## iOS API

JSON messages are presented in in primitive Objective-C types:
`NSDictionary`, `NSArray`, `NSString`, `NSNumber`.

At startup, the app should instantiate the App SDK service like so:

```objc
#import <SLKAppSDK/SLKAppSDK.h>

SLKAppSDKService *silkService = [[SLKAppSDKService alloc] initWithDelegate:delegate];
```

The `delegate` object must implement the `SLKAppSDKDelegate` protocol.
It receives the messages from the SDK via the `onMessage` method:

```objc
- (void)onMessage:(NSDictionary<NSString *, id> *)message {
  NSLog(@"Received message: %@", message);
}
```

To send messages to the SDK, the app can call the `postMessage` method
on the service:

```objc
[silkService postMessage:@{@"type": @"SOME_MESSAGE", ...}];
```

## Android API

JSON messages are represented as `android.os.Bundle` objects.

at startup, the application should start the `SilkAppSDKService`:

```java
ServiceConnection silkServiceConnection = new ServiceConnection() {
  @Override
  public void onServiceConnected(ComponentName name, IBinder serviceBinder) {
    SilkAppSDKService silkService = ((SilkAppSDKService.ServiceBinder)serviceBinder).getService();
    silkService.start(delegate);
  });
}
startService(new Intent(activity, SilkAppSDKService.class)); // keep service alive for duration of process
bindService(new Intent(activity, SilkAppSDKService.class), silkServiceConnection, Context.BIND_AUTO_CREATE);
```

The `delegate` object must implement the `SilkAppSDKDelegate` interface.
It receives the messages from the SDK via the `onMessage` method:

```java
SilkAppSDKDelegate delegate = new SilkAppSDKDelegate() {
  @Override
  public void onMessage(Bundle message) {
    Log.i("MyApp", "Received message: " + message.toString());
  }
}
```


## Example apps

See the `app-sdk-example` directory for some simple example apps.


## Development

NOTE: The Silk App SDK currently requires the React Native bundle
server to be running and accessible via localhost. This means the SDK
is currently limited to running in the iOS simulator and requires
using `adb reverse` on Android.

The bundle server can be started with the following commands:

```
$ cd app-sdk
$ npm start
$ adb reverse tcp:8081 tcp:8081
```

We will provide build targets that include the React Native bundle
without the need for running the packaging server soon.
