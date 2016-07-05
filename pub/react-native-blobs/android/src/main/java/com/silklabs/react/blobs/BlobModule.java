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
import java.util.ArrayList;

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
    int totalBlobSize = 0;
    ArrayList<ReadableMap> partList = new ArrayList<>(parts.size());
    for (int i = 0; i < parts.size(); i++) {
      ReadableMap part = parts.getMap(i);
      totalBlobSize += part.getInt("size");
      partList.add(i, part);
    }
    ByteBuffer buffer = ByteBuffer.allocate(totalBlobSize);
    for (ReadableMap part : partList) {
      buffer.put(mBlobProvider.resolve(part));
    }
    mBlobProvider.store(buffer.array(), blobId);
  }

  @ReactMethod
  public void release(String blobId) {
    mBlobProvider.release(blobId);
  }

}
