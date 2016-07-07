package com.silklabs.app.views;

import android.net.Uri;
import android.util.Base64;
import android.webkit.JavascriptInterface;

import com.silklabs.react.blobs.BlobModule;

public class MSEPlayerJSInterface {

  @JavascriptInterface
  public String resolveBlobURI(String uriString) {
    Uri uri = Uri.parse(uriString);
    return Base64.encodeToString(BlobModule.resolve(uri), Base64.NO_WRAP);
  }

}
