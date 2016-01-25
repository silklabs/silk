package com.silklabs.app.modules;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

import javax.crypto.SecretKey;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

import java.lang.StringBuilder;
import java.nio.charset.StandardCharsets;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.security.spec.InvalidKeySpecException;
import java.security.spec.KeySpec;

public class AppCrypto extends ReactContextBaseJavaModule {

  private static final String PBKDF2_ALGO = "PBKDF2WithHmacSHA256";
  private static final int PBKDF2_KEY_BITS = 256;

  public AppCrypto(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return "AppCrypto";
  }

  @ReactMethod
  public void pbkdf2KeyDerivation(
    String input,
    String salt,
    int rounds,
    Promise promise) {
    char[] inputChars = input.toCharArray(); // TODO: how does this deal with >ASCII chars?
    byte[] saltBytes = salt.getBytes(StandardCharsets.UTF_8);
    byte[] keyBytes;
    try {
      SecretKeyFactory secretKeyFactory = SecretKeyFactory.getInstance(PBKDF2_ALGO);
      KeySpec keySpec = new PBEKeySpec(inputChars, saltBytes, rounds, PBKDF2_KEY_BITS);
      SecretKey secretKey = secretKeyFactory.generateSecret(keySpec);
      keyBytes = secretKey.getEncoded();
    } catch (NoSuchAlgorithmException exception) {
      promise.reject(exception);
      return;
    } catch (InvalidKeySpecException exception) {
      promise.reject(exception);
      return;
    }

    // Convert to hex.
    // TODO: could factor this out into a separate helper.
    // TODO: could probably also produce a faster version of this.
    StringBuilder stringBuilder = new StringBuilder(keyBytes.length * 2);
    for (byte b: keyBytes) {
      stringBuilder.append(String.format("%02x", b & 0xff));
    }
    promise.resolve(stringBuilder.toString());
  }

  @ReactMethod
  public void getRandomBytes(int length, Promise promise) {
    SecureRandom random = new SecureRandom();
    byte[] bytes = new byte[length];
    random.nextBytes(bytes);
    promise.resolve(bytes);
  }

}
