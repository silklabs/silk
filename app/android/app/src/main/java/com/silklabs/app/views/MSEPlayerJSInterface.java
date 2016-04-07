package com.silklabs.app.views;

import android.content.ContentProviderClient;
import android.content.ContentResolver;
import android.net.Uri;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.facebook.react.bridge.ReactContext;
import com.silklabs.app.BlobProvider;

import java.io.UnsupportedEncodingException;

public class MSEPlayerJSInterface {

  private BlobProvider mBlobProvider;
  private ReactContext mReactContext;

  public MSEPlayerJSInterface(WebView webView) {
    mReactContext = (ReactContext) webView.getContext();
    initializeBlobProvider();
  }

  private void initializeBlobProvider() {
    ContentResolver resolver = mReactContext.getContentResolver();
    ContentProviderClient client = resolver.acquireContentProviderClient(BlobProvider.AUTHORITY);
    mBlobProvider = (BlobProvider)client.getLocalContentProvider();
    client.release();
  }

  @JavascriptInterface
  public String resolveBlobURI(String uriString) {
    Uri uri = Uri.parse(uriString);
    return Base64.encodeToString(mBlobProvider.resolveAndReleaseBlob(uri), Base64.NO_WRAP);
  }

}
