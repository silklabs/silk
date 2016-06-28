/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 */

package com.silklabs.react.blobs;

import android.content.ContentProviderClient;
import android.content.ContentResolver;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;

import java.nio.ByteBuffer;

public class BlobModule extends ReactContextBaseJavaModule {

  private ReactContext mReactContext;
  private BlobProvider mBlobProvider;

  public BlobModule(ReactApplicationContext reactContext) {
    super(reactContext);
    mReactContext = reactContext;
    initializeBlobProvider();
  }

  private void initializeBlobProvider() {
    ContentResolver resolver = mReactContext.getContentResolver();
    ContentProviderClient client = resolver.acquireContentProviderClient(BlobProvider.AUTHORITY);
    if (client == null) {
      return;
    }
    mBlobProvider = (BlobProvider)client.getLocalContentProvider();
    client.release();
  }

  @Override
  public String getName() {
    return "SLKBlobManager";
  }

  @ReactMethod
  public void createFromParts(ReadableArray parts, String blobId) {
    int totalSize = 0;
    for (int i = 0; i < parts.size(); i++) {
      ReadableMap part = parts.getMap(i);
      totalSize += part.getInt("size");
    }
    ByteBuffer buffer = ByteBuffer.allocate(totalSize);
    for (int i = 0; i < parts.size(); i++) {
      buffer.put(mBlobProvider.resolve(parts.getMap(i)));
    }
    mBlobProvider.store(buffer.array(), blobId);
  }

  @ReactMethod
  public void release(String blobId) {
    mBlobProvider.release(blobId);
  }

}
