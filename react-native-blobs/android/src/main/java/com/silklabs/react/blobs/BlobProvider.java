/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 */

package com.silklabs.react.blobs;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.support.annotation.Nullable;

import com.facebook.react.bridge.ReadableMap;

import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.OutputStream;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

public final class BlobProvider extends ContentProvider {

  public static final String AUTHORITY = "com.silklabs.react.blobs";

  private static final String TAG = "ReactBlobProvider";

  private Map<String, byte[]> mBlobs = new HashMap<>();

  // Direct API

  public String store(byte[] data) {
    String id = UUID.randomUUID().toString();
    store(data, id);
    return id;
  }

  public void store(byte[] data, String id) {
    mBlobs.put(id, data);
  }

  public void release(String id) {
    mBlobs.remove(id);
  }

  @Nullable
  public byte[] resolve(Uri uri) {
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
  public byte[] resolve(String id, int offset, int size) {
    byte[] data = mBlobs.remove(id);
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
  public byte[] resolve(ReadableMap blob) {
    return resolve(blob.getString("blobId"), blob.getInt("offset"), blob.getInt("size"));
  }

  // ContentProvider API

  @Override
  public boolean onCreate() {
    return false;
  }

  @Nullable
  @Override
  public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
    return null;
  }

  @Nullable
  @Override
  public String getType(Uri uri) {
    return null;
  }

  @Nullable
  @Override
  public Uri insert(Uri uri, ContentValues values) {
    return null;
  }

  @Override
  public int delete(Uri uri, String selection, String[] selectionArgs) {
    return 0;
  }

  @Override
  public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
    return 0;
  }

  @Override
  public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
    if (!mode.equals("r")) {
      throw new FileNotFoundException("Cannot open " + uri.toString() + " in mode '" + mode + "'");
    }
    byte[] data = resolve(uri);
    if (data == null) {
      throw new FileNotFoundException("Cannot open " + uri.toString() + ", blob not found.");
    }

    ParcelFileDescriptor[] pipe;
    try {
      pipe = ParcelFileDescriptor.createPipe();
    } catch (IOException exception) {
      return null;
    }
    ParcelFileDescriptor readSide = pipe[0];
    ParcelFileDescriptor writeSide = pipe[1];

    // TODO: Should this be async on another thread?
    OutputStream outputStream = new ParcelFileDescriptor.AutoCloseOutputStream(writeSide);
    try {
      outputStream.write(data);
      outputStream.close();
    } catch (IOException exception) {
      return null;
    }

    return readSide;
  }
}
