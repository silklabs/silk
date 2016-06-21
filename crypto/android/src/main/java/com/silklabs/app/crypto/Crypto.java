package com.silklabs.app.crypto;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.common.MapBuilder;

import org.libsodium.jni.NaCl;
import org.libsodium.jni.Sodium;
import org.spongycastle.crypto.digests.SHA256Digest;
import org.spongycastle.crypto.generators.PKCS5S2ParametersGenerator;
import org.spongycastle.crypto.params.KeyParameter;
import org.spongycastle.jce.provider.BouncyCastleProvider;

import java.lang.StringBuilder;
import java.io.UnsupportedEncodingException;
import java.security.Security;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Map;

import javax.annotation.Nullable;

public class Crypto extends ReactContextBaseJavaModule {

  static {
    Security.insertProviderAt(new BouncyCastleProvider(), 1);
  }

  private static final int PBKDF2_KEY_BITS = 256;

  private static final Sodium sodium = NaCl.sodium();
  private static final int crypto_sign_ed25519_BYTES = sodium.crypto_sign_ed25519_bytes();
  private static final int crypto_sign_ed25519_PUBLICKEYBYTES = sodium.crypto_sign_ed25519_publickeybytes();
  private static final int crypto_sign_ed25519_SECRETKEYBYTES = sodium.crypto_sign_ed25519_secretkeybytes();
  private static final int crypto_sign_ed25519_SEEDBYTES = sodium.crypto_box_seedbytes();

  public Crypto(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return "SLKCrypto";
  }

  public @Nullable Map getConstants() {
    return MapBuilder.of(
        "EncodingLength", crypto_sign_ed25519_SEEDBYTES);
  }

  // TODO: could probably build more efficient versions of these

  private static String bytesToHexString(byte[] bytes) {
    StringBuilder stringBuilder = new StringBuilder(bytes.length * 2);
    for (byte b: bytes) {
      stringBuilder.append(String.format("%02x", b & 0xff));
    }
    return stringBuilder.toString();
  }

  private static int hexStringToBytes(String hex, byte[] bytes) {
    int hexLength = hex.length();
    assert hexLength % 2 == 0;
    assert hexLength == 2 * bytes.length;
    hex = hex.toLowerCase();

    for (int i = 0; i < hexLength; i += 2) {
      int firstDigit = Character.digit(hex.charAt(i), 16);
      int secondDigit = Character.digit(hex.charAt(i + 1), 16);
      if (firstDigit < 0 || secondDigit < 0) {
        return -1;
      }
      bytes[i / 2] = (byte) ((firstDigit << 4) + secondDigit);
    }
    return 0;
  }

  @ReactMethod
  public void genRandomBytes(int length, Promise promise) {
    SecureRandom random = new SecureRandom();
    byte[] bytes = new byte[length];
    random.nextBytes(bytes);
    promise.resolve(bytesToHexString(bytes));
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

    promise.resolve(bytesToHexString(keyBytes));
  }

  @ReactMethod
  public void genEd25519KeyPair(Promise promise) {
    byte[] publicKeyBytes = new byte[crypto_sign_ed25519_PUBLICKEYBYTES];
    byte[] secretKeyBytes = new byte[crypto_sign_ed25519_SECRETKEYBYTES];
    int ret = sodium.crypto_sign_ed25519_keypair(publicKeyBytes, secretKeyBytes);
    if (ret != 0) {
      promise.reject("E_ED25519_KEY_PAIR_FAILED", "Failed to generate key pair");
      return;
    }
    WritableArray result = Arguments.createArray();
    // Only return the seed part of the secret key.
    byte[] seedBytes = Arrays.copyOfRange(secretKeyBytes, 0, crypto_sign_ed25519_SEEDBYTES);
    result.pushString(bytesToHexString(seedBytes));
    result.pushString(bytesToHexString(publicKeyBytes));
    promise.resolve(result);
  }

  @ReactMethod
  public void genEd25519PubKeyFromSecret(
    String seedHex,
    Promise promise) {
    if (seedHex.length() != 2 * crypto_sign_ed25519_SEEDBYTES) {
      promise.reject("E_ED25519_INVALID_KEY_LENGTH", "Failed to generate public key");
      return;
    }

    int ret;

    // Convert seed (secret) to binary.
    byte[] seedBytes = new byte[crypto_sign_ed25519_SEEDBYTES];
    ret = hexStringToBytes(seedHex, seedBytes);
    if (ret != 0) {
      promise.reject("E_ED25519_INVALID_KEY_FORMAT", "Failed to generate public key");
      return;
    }

    // Generate libsodium secret key [seed, public key].
    byte[] publicKeyBytes = new byte[crypto_sign_ed25519_PUBLICKEYBYTES];
    byte[] secretKeyBytes = new byte[crypto_sign_ed25519_SECRETKEYBYTES];
    ret = sodium.crypto_sign_ed25519_seed_keypair(publicKeyBytes, secretKeyBytes, seedBytes);
    if (ret != 0) {
      promise.reject("E_ED25519_PUB_KEY_FAILED", "Failed to generate public key");
      return;
    }
    promise.resolve(bytesToHexString(publicKeyBytes));
  }

  @ReactMethod
  public void genEd25519Sign(
    String msgHex,
    String seedHex,
    Promise promise) {
    if (seedHex.length() != 2 * crypto_sign_ed25519_SEEDBYTES) {
      promise.reject("E_ED25519_INVALID_KEY_LENGTH", "Failed to sign message");
      return;
    }

    int ret;

    // Convert seed (secret) to binary.
    byte[] seedBytes = new byte[crypto_sign_ed25519_SEEDBYTES];
    ret = hexStringToBytes(seedHex, seedBytes);
    if (ret != 0) {
      promise.reject("E_ED25519_INVALID_KEY_FORMAT", "Failed to sign message");
      return;
    }

    // Generate libsodium secret key [seed, public key].
    byte[] publicKeyBytes = new byte[crypto_sign_ed25519_PUBLICKEYBYTES];
    byte[] secretKeyBytes = new byte[crypto_sign_ed25519_SECRETKEYBYTES];
    ret = sodium.crypto_sign_ed25519_seed_keypair(publicKeyBytes, secretKeyBytes, seedBytes);
    if (ret != 0) {
      promise.reject("E_ED25519_KEY_PAIR_FAILED", "Failed to sign message");
      return;
    }

    // Convert message to binary.
    if (msgHex.length() % 2 != 0) {
      promise.reject("E_ED25519_INVALID_MESSAGE_FORMAT", "Failed to sign message");
      return;
    }
    byte[] msgBytes = new byte[msgHex.length() / 2];
    ret = hexStringToBytes(msgHex, msgBytes);
    if (ret != 0) {
      promise.reject("E_ED25519_INVALID_MESSAGE_FORMAT", "Failed to sign message");
      return;
    }

    // Generate signature.
    byte[] sigBytes = new byte[crypto_sign_ed25519_BYTES];
    int[] siglen = new int[1];
    ret = sodium.crypto_sign_ed25519_detached(sigBytes, siglen, msgBytes, msgBytes.length, secretKeyBytes);
    assert siglen[0] == sigBytes.length;
    if (ret != 0) {
      promise.reject("E_ED25519_SIGN_FAILED", "Failed to sign message");
      return;
    }

    promise.resolve(bytesToHexString(sigBytes));
  }

  @ReactMethod
  public void genEd25519Verify(
    String msgHex,
    String sigHex,
    String pubHex,
    Promise promise) {
    if (sigHex.length() != 2 * crypto_sign_ed25519_BYTES) {
      promise.reject("E_ED25519_INVALID_SIGNATURE_LENGTH", "Failed to verify signature");
      return;
    }

    if (pubHex.length() != 2 * crypto_sign_ed25519_PUBLICKEYBYTES) {
      promise.reject("E_ED25519_INVALID_KEY_LENGTH", "Failed to verify signature");
      return;
    }

    int ret;

    // Convert signature to binary.
    byte[] sigBytes = new byte[crypto_sign_ed25519_BYTES];
    ret = hexStringToBytes(sigHex, sigBytes);
    if (ret != 0) {
      promise.reject("E_ED25519_INVALID_SIGNATURE_FORMAT", "Failed to verify signature");
      return;
    }

    // Convert public key to binary.
    byte[] pubBytes = new byte[crypto_sign_ed25519_PUBLICKEYBYTES];
    ret = hexStringToBytes(pubHex, pubBytes);
    if (ret != 0) {
      promise.reject("E_ED25519_INVALID_KEY_FORMAT", "Failed to verify signature");
      return;
    }

    // Convert message to binary.
    if (msgHex.length() % 2 != 0) {
      promise.reject("E_ED25519_INVALID_MESSAGE_FORMAT", "Failed to verify signature");
      return;
    }
    byte[] msgBytes = new byte[msgHex.length() / 2];
    ret = hexStringToBytes(msgHex, msgBytes);
    if (ret != 0) {
      promise.reject("E_ED25519_INVALID_MESSAGE_FORMAT", "Failed to verify signature");
      return;
    }

    // Verify signature and clean up.
    ret = sodium.crypto_sign_ed25519_verify_detached(sigBytes, msgBytes, msgBytes.length, pubBytes);
    promise.resolve(ret == 0);
  }
}
