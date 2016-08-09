package com.silklabs.react.blesocket;

import android.os.Handler;
import android.os.Looper;

public final class Utils {

  private static long sBridgeThreadId = -1;
  private final static Handler sHandler = new Handler(Looper.getMainLooper());


  /**
   * Apparently |assert| isn't reliably checked on debug builds in Android, so
   * do this instead.
   */
  public static void check(boolean condition) {
    if (BuildConfig.DEBUG && !condition) {
      throw new AssertionError();
    }
  }

  public static void checkMainThread() {
    if (BuildConfig.DEBUG && Looper.myLooper() != Looper.getMainLooper()) {
      throw new AssertionError("checkMainThread failed");
    }
  }

  public static void postToMainThread(Runnable runnable) {
    sHandler.post(runnable);
  }

  public static void postToMainThreadWithDelay(Runnable runnable,
                                               long delayMs) {
    sHandler.postDelayed(runnable, delayMs);
  }
}
