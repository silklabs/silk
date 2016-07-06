# Web Blob API for React Native

This package implements the Blob API (ish) as known from browsers. Like in browsers, Blobs are opaque lumps of (usually binary) data that *can* be read into TypedArrays or strings, but don't have to be. Concretely in React Native that means that the binary data lives in native and not in JS, unless you explicitly request it.

Why is this useful? Say you're receiving some data via XHR, WebSocket, or WebRTC, or some custom method that you've implemented and you want to display it in an `<Image>` view. Or you want to send it along through some other means without looking paying the cost of transfering it to the JS thread and back.

Ultimately, this package is hopefully fairly shortlived as we're planning on upstreaming most if not all of this to React Native proper.

## Creation

### XMLHttpRequest

Integration for XMLHttpRequest is coming, but changes to React Native such as [an improved `responseType` support](https://github.com/facebook/react-native/pull/8324) are necessary first.

### WebSocket

Entirely analogous to how it works on the Web, you can have WebSockets give you a Blob instead of an ArrayBuffer whenever they receive a binary message:

```js
let ws = new WebSocket(...);
ws.binaryType = 'blob';
ws.onmessage = (event) => {
  event.data; // is a blob
};
```

### Combining existing Blobs

Multiple Blobs can be combined to a bigger Blob:

```js
let combinedBlob = new Blob([existingBlob, anotherBlob]);
```

Note: This creates a new native Blob instance and copies the data over. Freeing the individual parts will not free the combined Blob.

Creating Blobs in JS from anything other than existing Blobs is currently not supported.

### Slicing

Blobs can be sliced:

```
let halfBlob = blob.slice(0, Math.ceil(blob.size / 2));
```

Note: This does not create a new native Blob instance, it merely provides another view onto the same data. Freeing any instance of a Blob, pre or post slice, will free the underlying data.

## Consuming

### URL

Like in the browser, the data within a Blob can be represented in a URI. Anything that can load from URIs can therefore load data from Blobs, e.g. `<Image>` element:

```js
<Image source={{uri: URL.createObjectURL(blob)}} />;
```

### Freeing

The following method is part of the Blob standard, but is currently not implemented by browsers. However, because we can't automatically garbage collect our Blobs like browsers can, it will be necessary to provide a manual way of freeing Blobs, so that consumers can make use of it when appropriate:

```js
blob.close();
```

## Installation

After installing the `silk-react-native-blobs` package via NPM, ensure that the native code for iOS and Android is included in your app's project. `rnpm` provides a convenient way to do this:

```
rnpm link silk-react-native-blobs
```

### Android ContentProvider

To allow Blobs be accessed via `content://` URIs, you need to register `BlobProvider` as a ContentProvider in your app's `AndroidManifest.xml`:

```xml
<manifest>
  <application>
    <provider
      android:name="com.silklabs.react.blobs.BlobProvider"
      android:authorities="@string/blob_provider_authority"
      android:exported="false"
      />
  </application>
</manifest>
```

And then define the `blob_provider_authority` string in `res/values/strings.xml`. Use a dotted name that's entirely unique to your app:

```xml
<resources>
    <string name="blob_provider_authority">your.app.package.blobs</string>
</resources>
```
