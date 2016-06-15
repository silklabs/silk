package com.silklabs.app.modules;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

import org.spongycastle.crypto.digests.SHA256Digest;
import org.spongycastle.crypto.generators.PKCS5S2ParametersGenerator;
import org.spongycastle.crypto.params.KeyParameter;
import org.spongycastle.jce.provider.BouncyCastleProvider;

import java.lang.StringBuilder;
import java.io.UnsupportedEncodingException;
import java.security.Security;
import java.security.SecureRandom;

public class Crypto extends ReactContextBaseJavaModule {

  static {
    Security.insertProviderAt(new BouncyCastleProvider(), 1);
  }

  private static final int PBKDF2_KEY_BITS = 256;

  public Crypto(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return "SLKCrypto";
  }

  // TODO: could probably produce a faster version of this.
  private String bytesToHex(byte[] bytes) {
    StringBuilder stringBuilder = new StringBuilder(bytes.length * 2);
    for (byte b: bytes) {
      stringBuilder.append(String.format("%02x", b & 0xff));
    }
    return stringBuilder.toString();
  }

  @ReactMethod
  public void genRandomBytes(int length, Promise promise) {
    SecureRandom random = new SecureRandom();
    byte[] bytes = new byte[length];
    random.nextBytes(bytes);
    promise.resolve(bytesToHex(bytes));
  }

  @ReactMethod
  public void genPBKDF2KeyDerivation(
    String input,
    String salt,
    int rounds,
    Promise promise) {
    byte[] keyBytes;
    try {
      PKCS5S2ParametersGenerator gen = new PKCS5S2ParametersGenerator(new SHA256Digest());
      gen.init(input.getBytes("UTF-8"), salt.getBytes(), rounds);
      keyBytes = ((KeyParameter) gen.generateDerivedParameters(PBKDF2_KEY_BITS)).getKey();
    } catch (UnsupportedEncodingException exception) {
      promise.reject(exception);
      return;
    }

    promise.resolve(bytesToHex(keyBytes));
  }

}
