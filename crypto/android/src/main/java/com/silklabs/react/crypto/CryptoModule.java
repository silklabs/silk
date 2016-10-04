package com.silklabs.react.crypto;

import android.support.annotation.Nullable;

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

public class CryptoModule extends ReactContextBaseJavaModule {

  static {
    Security.insertProviderAt(new BouncyCastleProvider(), 1);
  }

  private static final int PBKDF2_KEY_BITS = 256;

  private static final Sodium sodium = NaCl.sodium();
  private static final int crypto_sign_ed25519_BYTES = sodium.crypto_sign_ed25519_bytes();
  private static final int crypto_sign_ed25519_PUBLICKEYBYTES = sodium.crypto_sign_ed25519_publickeybytes();
  private static final int crypto_sign_ed25519_SECRETKEYBYTES = sodium.crypto_sign_ed25519_secretkeybytes();
  private static final int crypto_sign_ed25519_SEEDBYTES = sodium.crypto_box_seedbytes();
  private static final int crypto_scalarmult_BYTES = sodium.crypto_scalarmult_bytes();

  public CryptoModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return "SLKCrypto";
  }

  @Nullable
  public Map getConstants() {
    return MapBuilder.of(
        "crypto_sign_ed25519_BYTES", crypto_sign_ed25519_BYTES,
        "crypto_sign_ed25519_PUBLICKEYBYTES", crypto_sign_ed25519_PUBLICKEYBYTES,
        "crypto_sign_ed25519_SECRETKEYBYTES", crypto_sign_ed25519_SECRETKEYBYTES,
        "crypto_sign_ed25519_SEEDBYTES", crypto_sign_ed25519_SEEDBYTES,
        "crypto_scalarmult_BYTES", crypto_scalarmult_BYTES);
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

  /**
   * Requests a number of random bytes.
   */
  @ReactMethod
  public void genRandomBytesHex(int length, Promise promise) {
    SecureRandom random = new SecureRandom();
    byte[] bytes = new byte[length];
    random.nextBytes(bytes);
    promise.resolve(bytesToHexString(bytes));
  }

  /**
   * Derive a 256 bit key from a password using PBKDF2 and HMAC-SHA256.
   */
  @ReactMethod
  public void genPBKDF2KeyDerivationHex(
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

  /**
   * Generate a new Ed25519 key pair.
   */
  @ReactMethod
  public void genEd25519KeyPairHex(Promise promise) {
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

  /**
   * Generate the public key for a given Ed25519 secret key.
   */
  @ReactMethod
  public void genEd25519VerifyingKeyFromSigningKeyHex(
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

  /**
   * Generate Ed25519 signature
   */
  @ReactMethod
  public void genEd25519SignHex(
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

  /**
   * Verify Ed25519 signature
   */
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


  /**
   * Generate a new X25519 key pair.
   */
  @ReactMethod
  public void genX25519KeyPairHex(Promise promise) {
    byte[] secretKeyBytes = new byte[crypto_scalarmult_BYTES];
    byte[] publicKeyBytes = new byte[crypto_scalarmult_BYTES];

    int ret;

    SecureRandom random = new SecureRandom();
    random.nextBytes(secretKeyBytes);

    ret = sodium.crypto_scalarmult_base(publicKeyBytes, secretKeyBytes);
    if (ret != 0) {
      promise.reject("E_X25519_KEY_PAIR_FAILED", "Failed to generate key pair");
      return;
    }
    WritableArray result = Arguments.createArray();
    result.pushString(bytesToHexString(secretKeyBytes));
    result.pushString(bytesToHexString(publicKeyBytes));
    promise.resolve(result);
  }

  /**
   * Generate the public key for a given X25519 secret key.
   */
  @ReactMethod
  public void genX25519PublicKeyFromPrivateKeyHex(
    String secretKeyHex,
    Promise promise) {
    if (secretKeyHex.length() != 2 * crypto_scalarmult_BYTES) {
      promise.reject("E_X25519_INVALID_KEY_LENGTH", "Failed to generate public key");
      return;
    }

    int ret;

    // Convert secret key to binary.
    byte[] secretKeyBytes = new byte[crypto_scalarmult_BYTES];
    ret = hexStringToBytes(secretKeyHex, secretKeyBytes);
    if (ret != 0) {
      promise.reject("E_X25519_INVALID_KEY_FORMAT", "Failed to generate public key");
      return;
    }

    // Generate public key.
    byte[] publicKeyBytes = new byte[crypto_scalarmult_BYTES];
    ret = sodium.crypto_scalarmult_base(publicKeyBytes, secretKeyBytes);
    if (ret != 0) {
      promise.reject("E_X25519_PUB_KEY_FAILED", "Failed to generate public key");
      return;
    }

    promise.resolve(bytesToHexString(publicKeyBytes));
  }

  /**
   * Generate an X25519 secret.
   */
  @ReactMethod
  public void genX25519SharedSecretHex(
    String ourSecretKeyHex,
    String theirPublicKeyHex,
    Promise promise) {
    if (ourSecretKeyHex.length() != 2 * crypto_scalarmult_BYTES ||
        theirPublicKeyHex.length() != 2 * crypto_scalarmult_BYTES) {
      promise.reject("E_X25519_INVALID_KEY_LENGTH", "Failed to derive shared secret");
      return;
    }

    int ret;

    // Convert our secret key to binary.
    byte[] ourSecretKeyBytes = new byte[crypto_scalarmult_BYTES];
    ret = hexStringToBytes(ourSecretKeyHex, ourSecretKeyBytes);
    if (ret != 0) {
      promise.reject("E_X25519_INVALID_KEY_FORMAT", "Failed to derive shared secret");
      return;
    }

    // Convert their public key to binary.
    byte[] theirPublicKeyBytes = new byte[crypto_scalarmult_BYTES];
    ret = hexStringToBytes(theirPublicKeyHex, theirPublicKeyBytes);
    if (ret != 0) {
      promise.reject("E_X25519_INVALID_KEY_FORMAT", "Failed to derive shared secret");
      return;
    }

    // Derive shared secret.
    byte[] sharedSecretBytes = new byte[crypto_scalarmult_BYTES];
    ret = sodium.crypto_scalarmult(sharedSecretBytes, ourSecretKeyBytes, theirPublicKeyBytes);
    if (ret != 0) {
      promise.reject("E_X25519_SHARED_SECRET_FAILED", "Failed to derive shared secret");
      return;
    }

    promise.resolve(bytesToHexString(sharedSecretBytes));
  }

}
