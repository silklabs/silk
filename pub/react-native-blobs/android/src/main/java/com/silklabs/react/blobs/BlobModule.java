/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 */

package com.silklabs.react.blobs;

import android.content.res.Resources;
import android.net.Uri;
import android.support.annotation.Nullable;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.common.MapBuilder;

import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

public class BlobModule extends ReactContextBaseJavaModule {

  private ReactContext mReactContext;

  public BlobModule(ReactApplicationContext reactContext) {
    super(reactContext);
    mReactContext = reactContext;
  }

  @Override
  public String getName() {
    return "SLKBlobManager";
  }

  @Nullable
  public Map getConstants() {
    // The application can register BlobProvider as a ContentProvider so that blobs are resolvable.
    // If it does, it needs to tell us what authority was used via this string resource.
    Resources resources = mReactContext.getResources();
    String packageName = mReactContext.getPackageName();
    int resourceId = resources.getIdentifier("blob_provider_authority", "string", packageName);
    if (resourceId == 0) {
      return null;
    }

    return MapBuilder.of(
      "blobUriScheme", "content",
      "blobUriHost", resources.getString(resourceId));
  }

  // Java API.
  //
  // Everything at this level is static so that the blobs are accessible from anywhere,
  // e.g. a ContentProvider.

  private static Map<String, byte[]> sBlobs = new HashMap<>();

  public static String store(byte[] data) {
    String id = UUID.randomUUID().toString();
    store(data, id);
    return id;
  }

  public static void store(byte[] data, String id) {
    sBlobs.put(id, data);
  }

  public static void remove(String id) {
    sBlobs.remove(id);
  }

  @Nullable
  public static byte[] resolve(Uri uri) {
    String id = uri.getLastPathSegment();
    int offset = 0;
    int size = -1;
    String offsetParam = uri.getQueryParameter("offset");
    if (offsetParam != null) {
      offset = Integer.parseInt(offsetParam, 10);
    }
    String sizeParam = uri.getQueryParameter("size");
    if (sizeParam != null) {
      size = Integer.parseInt(sizeParam, 10);
    }
    return resolve(id, offset, size);
  }

  @Nullable
  public static byte[] resolve(String id, int offset, int size) {
    byte[] data = sBlobs.remove(id);
    if (data == null){
      return null;
    }
    if (size == -1) {
      size = data.length - offset;
    }
    if (offset > 0) {
      data = Arrays.copyOfRange(data, offset, offset + size);
    }
    return data;
  }

  @Nullable
  public static byte[] resolve(ReadableMap blob) {
    return resolve(blob.getString("blobId"), blob.getInt("offset"), blob.getInt("size"));
  }

  // JS API

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
      buffer.put(resolve(part));
    }
    store(buffer.array(), blobId);
  }

  @ReactMethod
  public void release(String blobId) {
    remove(blobId);
  }

}
