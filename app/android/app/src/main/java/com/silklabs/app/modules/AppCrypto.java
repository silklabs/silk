package com.silklabs.app.modules;

import com.facebook.react.bridge.Callback;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class AppCrypto extends ReactContextBaseJavaModule {

    public AppCrypto(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "AppCrypto";
    }

    @ReactMethod
    public void PBKDF2KeyDerivation(
        String input,
        String salt,
        int rounds,
        Callback callback) {
        // TODO
    }

    @ReactMethod
    public void getRandomBytes(int length, Callback callback) {
        // TODO
    }

}
