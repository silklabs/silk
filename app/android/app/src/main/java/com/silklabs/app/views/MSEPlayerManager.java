package com.silklabs.app.views;

import android.os.Build;
import android.support.annotation.Nullable;
import android.util.Log;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebView;

import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.common.MapBuilder;
import com.facebook.react.views.webview.ReactWebViewManager;
import com.facebook.react.views.webview.WebViewConfig;
import com.silklabs.app.BuildConfig;

import java.util.Map;

public class MSEPlayerManager extends ReactWebViewManager {
  public static final int COMMAND_ENQUEUE_SEGMENT = 101;
  public static final int COMMAND_PLAY = 102;
  public static final int COMMAND_PAUSE = 103;

  private static final String TAG = "MSEPlayerManager";

  public MSEPlayerManager() {
    super(new WebViewConfig() {
      @Override
      public void configWebView(WebView webView) {
        webView.addJavascriptInterface(new MSEPlayerJSInterface(), "silkNativeHelper");
        webView.setWebChromeClient(new WebChromeClient() {
          @Override
          public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
            Log.d(TAG, consoleMessage.message());
            return true;
          }
        });
        if (BuildConfig.DEBUG && Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
          WebView.setWebContentsDebuggingEnabled(true);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR1) {
          // Ensure the <video> element's autoplay="" works without user intervention.
          webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
        }
        // This is necessary to ensure that URL.createObjectURL()
        // can be executed on the MediaSource object.
        webView.getSettings().setAllowFileAccessFromFileURLs(true);
      }
    });
  }

  @Override
  public String getName() {
    return "SilkMSEPlayer";
  }

  @Override
  public @Nullable Map<String, Integer> getCommandsMap() {
    return MapBuilder.of(
        "enqueueSegment", COMMAND_ENQUEUE_SEGMENT,
        "play", COMMAND_PLAY,
        "pause", COMMAND_PAUSE);
  }

  @Override
  public void receiveCommand(WebView root, int commandId, @Nullable ReadableArray args) {
    String injectedJS = null;
    switch (commandId) {
      case COMMAND_ENQUEUE_SEGMENT:
        Log.d(TAG, "receiveCommand: enqueueSegment(" + args.getString(0) + ")");
        injectedJS = "silkJSHelper.enqueueSegment(\"" + args.getString(0) + "\")";
        break;
      case COMMAND_PLAY:
        Log.d(TAG, "receiveCommand: play()");
        injectedJS = "silkJSHelper.play()";
        break;
      case COMMAND_PAUSE:
        Log.d(TAG, "receiveCommand: pause()");
        injectedJS = "silkJSHelper.pause()";
        break;
    }
    if (injectedJS != null) {
      root.loadUrl("javascript:(function() {'use strict'; " + injectedJS + ";})();");
    }
  }

}
