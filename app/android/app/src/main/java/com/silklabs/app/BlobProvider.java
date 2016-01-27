package com.silklabs.app;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.support.annotation.Nullable;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;

import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.OutputStream;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

public final class BlobProvider extends ContentProvider {

  public static final String AUTHORITY = "com.silklabs.app.blobs";

  private static final String TAG = "SilkBlobProvider";

  private Map<String, byte[]> mBlobs = new HashMap<>();

  // Direct API

  public WritableMap store(byte[] data) {
    String id = UUID.randomUUID().toString();
    mBlobs.put(id, data);

    WritableMap blob = Arguments.createMap();
    blob.putString("__native_type", "Blob");
    blob.putString("id", id);
    blob.putInt("length", data.length);
    if (data.length > 0) {
      blob.putInt("firstByte", (int)data[0]);
    }
    return blob;
  }

  @Nullable
  public byte[] resolveAndReleaseBlob(Uri uri) {
    String id = uri.getLastPathSegment();
    int offset = 0;
    String offsetParam = uri.getQueryParameter("offset");
    if (offsetParam != null) {
      offset = Integer.parseInt(offsetParam, 10);
    }
    return resolveAndReleaseBlob(id, offset);
  }

  @Nullable
  public byte[] resolveAndReleaseBlob(ReadableMap blob) {
    String id = blob.getString("id");
    int offset = 0;
    if (blob.hasKey("offset")) {
      offset = blob.getInt("offset");
    }
    return resolveAndReleaseBlob(id, offset);
  }

  @Nullable
  public byte[] resolveAndReleaseBlob(String id, int offset) {
    byte[] data = mBlobs.remove(id);
    if (offset > 0) {
      data = Arrays.copyOfRange(data, offset, data.length);
    }
    return data;
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
    byte[] data = resolveAndReleaseBlob(uri);

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
