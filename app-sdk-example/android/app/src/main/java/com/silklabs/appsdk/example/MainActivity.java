package com.silklabs.appsdk.example;

import android.app.Activity;
import android.app.Dialog;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.provider.Settings;
import android.support.annotation.NonNull;
import android.support.v4.app.FragmentActivity;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.InputMethodManager;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.Spinner;
import android.widget.SpinnerAdapter;
import android.widget.TextView;
import android.widget.EditText;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.view.View.OnClickListener;

import com.google.android.gms.auth.api.Auth;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.android.gms.auth.api.signin.GoogleSignInResult;
import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.SignInButton;
import com.google.android.gms.common.api.GoogleApiClient;
import com.google.android.gms.common.api.ResultCallback;
import com.google.android.gms.common.api.Status;
import com.silklabs.appsdk.SilkAppSDKService;
import com.silklabs.appsdk.SilkAppSDKDelegate;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;

public class MainActivity extends FragmentActivity implements
  GoogleApiClient.OnConnectionFailedListener {

  private final String TAG = "SilkAppSDKExample";
  private final int REQUEST_CODE_PERMISION_SYSTEM_ALERT_WINDOW = 1234; // Random number
  private static final int RC_GET_TOKEN = 9001;
  private boolean mResumed = false;

  private SilkAppSDKService mSilkService = null;
  private TextView networkStatusTextView = null;
  private TextView authStatusTextView = null;
  private Button silkLoginButton = null;
  private TextView googleAuthStatusTextView = null;
  private Button logoutButton = null;
  private SignInButton googleLoginButton = null;
  private EditText emailText = null;
  private EditText passwordText = null;
  private Button echoButton = null;
  private Spinner deviceListSpinner = null;
  private Button configureButton = null;
  private Spinner ssidListSpinner = null;
  private AlertDialog wifiDialog = null;
  private TextView deviceStatusTextView = null;
  private GoogleApiClient mGoogleApiClient = null;
  private Button authorizeButton = null;
  private Button removeButton = null;

  private ServiceConnection mSilkServiceConnection = new ServiceConnection() {
    @Override
    public void onServiceConnected(ComponentName name, IBinder serviceBinder) {
      mSilkService = ((SilkAppSDKService.ServiceBinder)serviceBinder).getService();
      mSilkService.start(new SilkAppSDKDelegate() {
        @Override
        public void onMessage(Map<String, Object> message) {
          Log.i(TAG, "Received message from SDK: " + message.toString());
          String messageType = (String) message.get("type");

          switch(messageType) {
            case "INITIALIZED":
              Log.i(TAG, "Silk-sdk initialized");
              break;
            case "CLIENT_STATUS": {
              String clientConnectionStatus = (String) message.get("clientConnectionStatus");
              onNetworkStatusChanged(clientConnectionStatus);

              String clientAuthStatus = (String) message.get("clientAuthStatus");
              onAuthStatusChanged(clientAuthStatus);

              Object clientConnectionError = message.get("clientConnectionError");
              if (clientConnectionError != null) {
                onError((String) clientConnectionError);
              }

              Object clientAuthError = message.get("clientAuthError");
              if (clientAuthError != null) {
                onError((String) clientAuthError);
              }
              break;
            }
            case "DEVICE_LIST":
              onDeviceListAvailable((ArrayList<Map<String, Object>>) message.get("devices"));
              break;
            case "DEVICE_STATUS":
              onDeviceStatus(message);
              break;
            case "MESSAGE_ERROR": {
              String errorMsg = (String) message.get("error");
              onError(errorMsg);
              break;
            }
            case "DEVICE_MESSAGE_ERROR": {
              String errorMsg = (String) message.get("error");
              String deviceId = (String) message.get("deviceId");
              onError("device (" + deviceId.substring(0, 5) + "...)" + ": " + errorMsg);
              break;
            }
            case "DEVICE_CONFIG_SUCCESS": {
              int deviceConfigId =
                ((Double) message.get("deviceConfigId")).intValue();
              final Device device = getDeviceByDeviceConfigId(deviceConfigId);
              if (device == null) {
                return;
              }
              device.waitingForResponse = false;
              onSuccess("Successfully configured (" + deviceConfigId + ")");
              break;
            }
            case "DEVICE_CONFIG_ERROR":
            case "DEVICE_CONFIG_FATAL_ERROR": {
              int deviceConfigId =
                ((Double) message.get("deviceConfigId")).intValue();
              final Device device = getDeviceByDeviceConfigId(deviceConfigId);
              if (device == null) {
                return;
              }

              device.waitingForResponse = false;
              String configError = (String) message.get("configError");
              onError("Failed to configure (" + deviceConfigId + "): " + configError);
              break;
            }
            case "DEVICE_CONFIG_WIFI_NETWORKS": {
              Integer wifiDeviceConfigId =
                ((Double) message.get("deviceConfigId")).intValue();
              Log.d(TAG, "Received wifi network message for " + wifiDeviceConfigId);

              if (getDeviceByDeviceConfigId(wifiDeviceConfigId) == null) {
                return;
              }

              onWifiNetworksAvailable((ArrayList<Map<String, Object>>) message.get("wifiNetworks"));
              break;
            }
            case "DEVICE_WIFI_NETWORKS": {
              String deviceId = ((String) message.get("deviceId"));
              Log.d(TAG, "Received wifi network message for " + deviceId);

              if (getDeviceByDeviceId(deviceId) == null) {
                return;
              }

              onWifiNetworksAvailable((ArrayList<Map<String, Object>>) message.get("wifiNetworks"));
              break;
            }
            case "DEVICE_MESSAGE": {
              Map<String, Object> payload = (Map<String, Object>) message.get("payload");
              String command = (String) payload.get("command");
              if (command.equals("echo")) {
                onSuccess(payload.get("payload").toString());
              }
              break;
            }
            case "DEVICE_CONNECTION_DETAILS": {
              onDeviceConnectionDetails(message);
              break;
            }
            case "DEVICE_UPDATE_STATUS": {
              onDeviceUpdateStatus(message);
              break;
            }
            case "DEVICE_REMOVE_SUCCESS": {
              String deviceId = (String) message.get("deviceId");
              final Device device = getDeviceByDeviceId(deviceId);
              if (device == null) {
                return;
              }

              device.waitingForResponse = false;
              onSuccess("Successfully removed (" + deviceId.substring(0, 5) + "...)");
              break;
            }
            case "DEVICE_REMOVE_ERROR": {
              String deviceId = (String) message.get("deviceId");
              final Device device = getDeviceByDeviceId(deviceId);
              if (device == null) {
                return;
              }

              device.waitingForResponse = false;
              String error = (String) message.get("error");
              onError("Failed to remove (" + deviceId.substring(0, 5) + "...): " + error);
              break;
            }
            default:
              onError("Unknown message type: " + messageType);
          }
        }
      });
      if (mResumed) {
        mSilkService.onActivityResume(MainActivity.this);
      } else {
        mSilkService.onActivityPause();
      }
    }

    /**
     * Handle clientConnectionStatus part of CLIENT_STATUS message
     * @param networkStatus
     */
    private void onNetworkStatusChanged(final String networkStatus) {
      runOnUiThread(new Runnable() {
        public void run() {
          networkStatusTextView.setText(networkStatus);
        }
      });
    }

    /**
     * Handle clientAuthStatus part of CLIENT_STATUS message
     * @param authStatus
     */
    private void onAuthStatusChanged(final String authStatus) {
      runOnUiThread(new Runnable() {
        public void run() {
          if (authStatus.equals("AUTHENTICATED")) {
            logoutButton.setEnabled(true);
          } else {
            logoutButton.setEnabled(false);
          }

          if (authStatus.equals("NOT_AUTHENTICATED")) {
            silkLoginButton.setEnabled(true);
            googleLoginButton.setEnabled(true);
            disableUI();
          } else {
            silkLoginButton.setEnabled(false);
            googleLoginButton.setEnabled(false);
          }

          authStatusTextView.setText(authStatus);
        }
      });
    }

    /**
     * Handle DEVICE_LIST message
     * @param devices
     */
    private void onDeviceListAvailable(final ArrayList<Map<String, Object>> devices) {
      runOnUiThread(new Runnable() {
        public void run() {
          // Get currently selected item
          String currentItem = null;
          Device currentDevice = (Device) deviceListSpinner.getSelectedItem();
          if (currentDevice != null) {
            currentItem = currentDevice.toString();
          }

          ArrayList<Device> devicesList = new ArrayList<Device>();

          for (int i = 0; i < devices.size(); i++) {
            Map<String, Object> device = devices.get(i);
            Device myDevice = new Device();
            myDevice.deviceType = (String) device.get("deviceType");
            myDevice.deviceId = (String) device.get("deviceId");
            myDevice.deviceConfigStatus = (String) device.get("deviceConfigStatus");
            myDevice.serverConnectionStatus = (String) device.get("serverConnectionStatus");
            myDevice.bleConnectionStatus = (String) device.get("bleConnectionStatus");
            myDevice.bleConnectionError = (String) device.get("bleConnectionError");
            myDevice.rtcConnectionStatus = (String) device.get("rtcConnectionStatus");
            myDevice.rtcConnectionError = (String) device.get("rtcConnectionError");

            if (myDevice.deviceConfigStatus.equals("CONFIGURED")) {
              myDevice.accountDeviceNumber =
                ((Double) device.get("accountDeviceNumber")).intValue();
            } else {
              myDevice.deviceConfigId =
                ((Double) device.get("deviceConfigId")).intValue();
            }
            devicesList.add(myDevice);
          }

          // Update the devices list
          ArrayAdapter<Device> devicesListAdapter = new ArrayAdapter<Device>(getBaseContext(),
              android.R.layout.simple_spinner_item, devicesList);
          devicesListAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
          deviceListSpinner.setAdapter(devicesListAdapter);

          // Clear the existing device status message
          if (devicesList.size() <= 0) {
            echoButton.setEnabled(false);
            configureButton.setEnabled(false);
            deviceStatusTextView.setText("");
          }

          // Preselect the last selected item
          if (currentItem != null) {
            selectDeviceListSpinnerItem(currentItem);
          }

          currentDevice = (Device) deviceListSpinner.getSelectedItem();
          if (currentDevice != null &&
              currentDevice.deviceConfigStatus.equals("CONFIGURED") &&
              currentDevice.bleConnectionStatus.equals("CONNECTED")) {
            if (wifiDialog.isShowing()) {
              Map<String, Object> message = new HashMap<>();
              message.put("type", "DEVICE_WIFI_LIST");
              message.put("deviceId", currentDevice.deviceId);
              mSilkService.postMessage(message);
            }

            Map<String, Object> message = new HashMap<>();
            message.put("type", "DEVICE_WIFI_LEVEL");
            message.put("deviceId", currentDevice.deviceId);
            mSilkService.postMessage(message);
          }
        }
      });
    }

    private void onDeviceStatus(final Map<String, Object> message) {
      runOnUiThread(new Runnable() {
        public void run() {
          final String deviceId = (String) message.get("deviceId");

          Object deviceConfigIdEntry = message.get("deviceConfigId");
          final Integer deviceConfigId =
            deviceConfigIdEntry == null ?
              -1 :
              ((Double) deviceConfigIdEntry).intValue();

          Device currentDevice = (Device) deviceListSpinner.getSelectedItem();

          ArrayAdapter<Device> adapter = (ArrayAdapter<Device>) deviceListSpinner.getAdapter();
          final int count = adapter.getCount();
          for (int index = 0; index < count; index++) {
            Device device = (Device) adapter.getItem(index);

            if ((deviceId == null || !deviceId.equals(device.deviceId)) &&
                !deviceConfigId.equals(device.deviceConfigId)) {
              continue;
            }

            device.deviceType = (String) message.get("deviceType");
            device.deviceId = (String) message.get("deviceId");
            device.deviceConfigStatus = (String) message.get("deviceConfigStatus");
            device.serverConnectionStatus = (String) message.get("serverConnectionStatus");
            device.bleConnectionStatus = (String) message.get("bleConnectionStatus");
            device.bleConnectionError = (String) message.get("bleConnectionError");
            device.rtcConnectionStatus = (String) message.get("rtcConnectionStatus");
            device.rtcConnectionError = (String) message.get("rtcConnectionError");
            if (device.rtcConnectionStatus.equals("CONNECTED")) {
              device.paired = true;
            }
            if (device.deviceConfigStatus.equals("CONFIGURED")) {
              device.accountDeviceNumber =
                ((Double) message.get("accountDeviceNumber")).intValue();
            } else {
              device.deviceConfigId = deviceConfigId;
            }

            // Notify adapter that the device status is updated so it can refresh
            // itself if needed
            adapter.notifyDataSetChanged();

            if (device == currentDevice) {
              updateUI(device);

              if (currentDevice.bleConnectionStatus.equals("CONNECTED")) {
                if (currentDevice.deviceConfigStatus.equals("CONFIGURED")) {
                  if (wifiDialog.isShowing()) {
                    Map<String, Object> message = new HashMap<>();
                    message.put("type", "DEVICE_WIFI_LIST");
                    message.put("deviceId", currentDevice.deviceId);
                    mSilkService.postMessage(message);
                  }

                  Map<String, Object> message = new HashMap<>();
                  message.put("type", "DEVICE_WIFI_GETINFO");
                  message.put("deviceId", currentDevice.deviceId);
                  mSilkService.postMessage(message);
                } else if (wifiDialog.isShowing() && device.deviceId != null) {
                  final Button button =
                    wifiDialog.getButton(AlertDialog.BUTTON_POSITIVE);
                  button.setEnabled(device != null && device.deviceId != null);
                }
              }
            }
            break;
          }
        }
      });
    }

    private void onDeviceConnectionDetails(final Map<String, Object> message) {
      runOnUiThread(new Runnable() {
        public void run() {
          final String deviceId = (String) message.get("deviceId");
          Integer accountDeviceNumber = null;
          if (message.get("accountDeviceNumber") != null) {
            accountDeviceNumber =
              ((Double) message.get("accountDeviceNumber")).intValue();
          }

          if (deviceId == null && accountDeviceNumber == null) {
            return;
          }

          Device currentDevice = (Device) deviceListSpinner.getSelectedItem();

          SpinnerAdapter adapter = deviceListSpinner.getAdapter();
          final int count = adapter.getCount();
          for (int index = 0; index < count; index++) {
            Device device = (Device) adapter.getItem(index);

            if ((deviceId != null &&
                  !deviceId.equals(device.deviceId)) ||
                (accountDeviceNumber != null &&
                  !accountDeviceNumber.equals((device.accountDeviceNumber)))) {
              continue;
            }

            boolean nowPaired = (Boolean) message.get("paired");
            if (device.isPairing && !device.paired && nowPaired) {
              onSuccess("Successfully authorized (" + deviceId.substring(0, 5) + "...)");
              device.isPairing = false;
              device.waitingForResponse = false;
            }
            device.paired = nowPaired;

            device.wifiConnectionStatus = (String) message.get("wifiStatus");
            device.wifiSSID = (String) message.get("wifiSSID");
            if (device.waitingForResponse && "CONNECTED".equals(device.wifiConnectionStatus)) {
              // Device successfully reconfigured
              device.waitingForResponse = false;
            }

            Double signalStrength = (Double) message.get("wifiLevel");
            if (signalStrength != null) {
              device.wifiSignalStrength = signalStrength.intValue();
            }
            device.wifiConnectionError = (String) message.get("wifiError");

            device.serverConnectionStatus =
              (String) message.get("serverStatus");
            device.serverConnectionError = (String) message.get("serverError");

            if (device == currentDevice) {
              updateUI(device);
            }

            break;
          }
        }
      });
    }

    private void onDeviceUpdateStatus(final Map<String, Object> message) {
      runOnUiThread(new Runnable() {
        public void run() {
          final String deviceId = (String) message.get("deviceId");

          Device currentDevice = (Device) deviceListSpinner.getSelectedItem();

          SpinnerAdapter adapter = deviceListSpinner.getAdapter();
          final int count = adapter.getCount();
          for (int index = 0; index < count; index++) {
            Device device = (Device) adapter.getItem(index);

            if (!deviceId.equals(device.deviceId)) {
              continue;
            }

            String state = (String) message.get("state");

            String error = (String) message.get("error");
            if (error != null) {
              state += " (Error: " + error + ")";
            } else {
              Map<String, Object> progress =
                (Map<String, Object>) message.get("progress");
              if (progress != null) {
                state +=
                  " (" + ((Double) progress.get("percentageComplete")) + "%)";
              }
            }

            device.updateState = state;

            if (device == currentDevice) {
              deviceStatusTextView.setText(device.status());
            }

            break;
          }
        }
      });
    }

    /**
     * Handle DEVICE_CONFIG_WIFI_NETWORKS message
     * @param networks
     */
    private void onWifiNetworksAvailable(final ArrayList<Map<String, Object>> networks) {
      runOnUiThread(new Runnable() {
        public void run() {
          // Get currently selected item
          String currentItem = null;
          if (ssidListSpinner.getSelectedItem() != null) {
            currentItem = ssidListSpinner.getSelectedItem().toString();
          }

          ArrayList<String> ssids = new ArrayList<String>();
          for (int i = 0; i < networks.size(); i++) {
            Map<String, Object> network = networks.get(i);
            ssids.add((String) network.get("ssid"));
          }

          // Update the wifi ssid list
          ArrayAdapter<String> ssidsAdapter = new ArrayAdapter<String>(getBaseContext(),
            android.R.layout.simple_spinner_item, ssids);
          ssidsAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
          ssidListSpinner.setAdapter(ssidsAdapter);

          // Preselect the last selected item
          if (currentItem != null) {
            selectSsidListSpinnerItem(currentItem);
          }
        }
      });
    }

    @Override
    public void onServiceDisconnected(ComponentName name) {
      mSilkService = null;
    }
  };

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    checkDrawOverlayPermission();

    // Configure sign-in to request the user's ID, email address, and basic
    // profile. ID and basic profile are included in DEFAULT_SIGN_IN.
    String serverClientId = getString(R.string.server_client_id);
    GoogleSignInOptions gso = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
      .requestIdToken(serverClientId)
      .requestEmail()
      .build();

    // Build a GoogleApiClient with access to the Google Sign-In API and the
    // options specified by gso.
    mGoogleApiClient = new GoogleApiClient.Builder(this)
      .enableAutoManage(this /* FragmentActivity */, this /* OnConnectionFailedListener */)
      .addApi(Auth.GOOGLE_SIGN_IN_API, gso)
      .build();
  }

  /**
   * Initialize main UI controls
   */
  protected void initialize() {
    setContentView(R.layout.main);
    networkStatusTextView = (TextView) findViewById(R.id.networkStatusResultView);
    networkStatusTextView.setText("INITIALIZING");
    authStatusTextView = (TextView) findViewById(R.id.authStatusResultView);

    emailText = (EditText) findViewById(R.id.emailText);
    emailText.setOnFocusChangeListener(focusChangeListener);

    passwordText = (EditText) findViewById(R.id.passwordText);
    passwordText.setOnFocusChangeListener(focusChangeListener);

    deviceListSpinner = (Spinner) findViewById(R.id.deviceList);
    deviceListSpinner.setOnItemSelectedListener(deviceSelectedListener);

    silkLoginButton = (Button) findViewById(R.id.loginButton);
    silkLoginButton.setEnabled(false);
    silkLoginButton.setOnClickListener(silkLoginButtonListener);

    logoutButton = (Button) findViewById(R.id.logoutButton);
    logoutButton.setEnabled(false);
    logoutButton.setOnClickListener(silkLogoutButtonListener);

    googleLoginButton = (SignInButton) findViewById(R.id.googleLoginButton);
    googleLoginButton.setOnClickListener(googleLoginButtonListener);
    googleAuthStatusTextView = (TextView) findViewById(R.id.googleAuthStatusResultView);

    echoButton = (Button) findViewById(R.id.sendEchoMessageButton);
    echoButton.setOnClickListener(echoButtonListener);
    echoButton.setEnabled(false);

    configureButton = (Button) findViewById(R.id.configureButton);
    configureButton.setOnClickListener(configureButtonListener);
    configureButton.setEnabled(false);

    authorizeButton = (Button) findViewById(R.id.authorizeButton);
    authorizeButton.setOnClickListener(authorizeButtonListener);
    authorizeButton.setEnabled(false);

    removeButton = (Button) findViewById(R.id.removeButton);
    removeButton.setOnClickListener(removeButtonListener);
    removeButton.setEnabled(false);

    deviceStatusTextView = (TextView) findViewById(R.id.deviceStatusTextView);

    createWifiDialog();

    startService(new Intent(this, SilkAppSDKService.class)); // keep service alive for duration of process
    bindService(new Intent(this, SilkAppSDKService.class), mSilkServiceConnection, Context.BIND_AUTO_CREATE);
  }

  /**
   * Display wifi credentials dialog
   */
  protected void createWifiDialog() {
    AlertDialog.Builder builder = new AlertDialog.Builder(MainActivity.this);
    wifiDialog = builder.create();

    wifiDialog.setTitle(R.string.wifi_title);
    View viewInflated = LayoutInflater.from(getBaseContext()).inflate(R.layout.wifi,
      (ViewGroup) findViewById(android.R.id.content), false);
    ssidListSpinner = (Spinner) viewInflated.findViewById(R.id.ssidList);
    ssidListSpinner.setOnItemSelectedListener(ssidSelectedListener);
    final EditText passwordEditText = (EditText) viewInflated.findViewById(R.id.wifiPasswordText);

    wifiDialog.setView(viewInflated);

    wifiDialog.setButton(Dialog.BUTTON_POSITIVE, "save", new DialogInterface.OnClickListener() {
      @Override
      public void onClick(DialogInterface dialog, int which) {
        final Map<String, Object> message;
        final String ssid = ssidListSpinner.getSelectedItem().toString();
        final String password = passwordEditText.getText().toString();
        final Device device = (Device) deviceListSpinner.getSelectedItem();

        device.waitingForResponse = true;
        disableUI();
        if (device.deviceConfigStatus.equals("CONFIGURED")) {
          message = new HashMap<>();
          message.put("type", "DEVICE_WIFI_SET");
          message.put("deviceId", device.deviceId);
          message.put("accessPoint", ssid);
          message.put("password", password);
        } else {
          // Set device configuration
          message = new HashMap<>();
          message.put("type", "DEVICE_CONFIG_SET_CONFIG");
          message.put("deviceConfigId", device.deviceConfigId);
          message.put("deviceName", "test");
          message.put("wifiSSID", ssid);
          message.put("wifiPassword", password);
        }
        mSilkService.postMessage(message);
        dialog.dismiss();
      }
    });
    wifiDialog.setButton(Dialog.BUTTON_NEGATIVE, "cancel", new DialogInterface.OnClickListener() {
      @Override
      public void onClick(DialogInterface dialog, int which) {
        Device device = (Device) deviceListSpinner.getSelectedItem();

        if (device.deviceConfigStatus.equals("CONFIGURED")) {
          Map<String, Object> message = new HashMap<>();
          message.put("type", "DEVICE_BLE_DISCONNECT");
          message.put("deviceId", device.deviceId);
          mSilkService.postMessage(message);
        } else {
          // Abort device configuration
          Map<String, Object> message = new HashMap<>();
          message.put("type", "DEVICE_CONFIG_ABORT");
          message.put("deviceConfigId", device.deviceConfigId);
          mSilkService.postMessage(message);
        }

        dialog.cancel();
      }
    });
  }

  /**
   * Check to see if the app has permission to draw over the other apps. If not, request for the
   * permission
   */
  public void checkDrawOverlayPermission() {
    if(Build.VERSION.SDK_INT >= 23) {
      // Check if we already  have permission to draw over other apps
      if (!Settings.canDrawOverlays(this)) {
        // If not construct intent to request permission
        Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
          Uri.parse("package:" + getPackageName()));
        // request permission via start activity for result
        startActivityForResult(intent, REQUEST_CODE_PERMISION_SYSTEM_ALERT_WINDOW);
        return;
      }
    }
    initialize();
  }

  @Override
  protected void onActivityResult(int requestCode, int resultCode, Intent data) {
    if(Build.VERSION.SDK_INT >= 23) {
      if (requestCode == REQUEST_CODE_PERMISION_SYSTEM_ALERT_WINDOW) {
        if (Settings.canDrawOverlays(this)) {
          initialize();
        } else {
          onError("App can not run until the permission to draw over other apps is granted ");
        }
      }
    }
    // Result returned from launching the Intent from GoogleSignInApi.getSignInIntent(...);
    if (requestCode == RC_GET_TOKEN) {
      GoogleSignInResult result = Auth.GoogleSignInApi.getSignInResultFromIntent(data);
      handleSignInResult(result);
    }
  }

  @Override
  protected void onResume() {
    super.onResume();
    mResumed = true;
    if (mSilkService != null) {
      mSilkService.onActivityResume(this);
    }
  }

  @Override
  protected void onPause() {
    super.onPause();
    mResumed = false;
    if (mSilkService != null) {
      mSilkService.onActivityPause();
    }
  }

  @Override
  protected void onDestroy() {
    super.onDestroy();
    if (mSilkService != null) {
      mSilkService.onActivityDestroy();
      unbindService(mSilkServiceConnection);
    }
    if (wifiDialog != null) {
      wifiDialog.cancel();
    }
  }

  /**
   * Handle Silk Login button click
   */
  private OnClickListener silkLoginButtonListener = new View.OnClickListener() {
    public void onClick(View view) {
      hideKeyboard(view);
      Map<String, Object> message = new HashMap<>();
      message.put("type", "ACCOUNT_LOGIN_PASSWORD");
      message.put("email", emailText.getText().toString());
      message.put("password", passwordText.getText().toString());
      emailText.setText("");
      passwordText.setText("");
      mSilkService.postMessage(message);
    }
  };

  /**
   * Handle Silk Logout button click
   */
  private OnClickListener silkLogoutButtonListener = new View.OnClickListener() {
    public void onClick(View v) {
      logoutButton.setEnabled(false);
      Map<String, Object> message = new HashMap<>();
      message.put("type", "ACCOUNT_LOGOUT");
      mSilkService.postMessage(message);

      // Sign out of google services
      try {
        Auth.GoogleSignInApi.signOut(mGoogleApiClient).setResultCallback(
          new ResultCallback<Status>() {
            @Override
            public void onResult(Status status) {
              Log.d(TAG, "Google sign out result" + status);
              onGoogleAuthStatusChanged("");
            }
          });
      } catch(Exception e) {
        Log.e(TAG, "Failed to sign out: " + e.toString());
      }
    }
  };

  /**
   * Handle Google Login button click
   */
  private OnClickListener googleLoginButtonListener = new View.OnClickListener() {
    public void onClick(View view) {
      hideKeyboard(view);
      Intent signInIntent = Auth.GoogleSignInApi.getSignInIntent(mGoogleApiClient);
      startActivityForResult(signInIntent, RC_GET_TOKEN);
    }
  };

  /**
   * Handle Send echo button click
   */
  private OnClickListener echoButtonListener = new View.OnClickListener() {
    public void onClick(View v) {
      Device device = (Device) deviceListSpinner.getSelectedItem();
      if (device.deviceConfigStatus.equals("UNCONFIGURED")) {
        onError("Selected device is not configured. Please configure it first");
        return;
      }

      Map<String, Object> message = new HashMap<>();
      message.put("type", "DEVICE_MESSAGE");
      message.put("deviceId", device.deviceId);
      message.put("payload",
                  "{" +
                    "\"command\": \"echo\", " +
                    "\"payload\": {\"message\": \"Love the app\"}" +
                  "}");
      mSilkService.postMessage(message);
    }
  };

  /**
   * Handle Configure button click
   */
  private OnClickListener configureButtonListener = new View.OnClickListener() {
    public void onClick(View v) {
      Device device = (Device) deviceListSpinner.getSelectedItem();
      if (device.deviceConfigStatus.equals("CONFIGURED")) {
        // Attempt device reconfiguration
        Map<String, Object> message = new HashMap<>();
        message.put("type", "DEVICE_BLE_CONNECT");
        message.put("deviceId", device.deviceId);
        mSilkService.postMessage(message);
      } else {
        // Accept device configuration
        Map<String, Object> message = new HashMap<>();
        message.put("type", "DEVICE_CONFIG_ACCEPT");
        message.put("deviceConfigId", device.deviceConfigId);
        mSilkService.postMessage(message);
      }

      wifiDialog.show();

      wifiDialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(false);
    }
  };

  /**
   * Handle Configure button click
   */
  private OnClickListener authorizeButtonListener = new View.OnClickListener() {
    public void onClick(View v) {
      // Attempt device authorization
      Device device = (Device) deviceListSpinner.getSelectedItem();
      device.isPairing = true;
      device.waitingForResponse = true;
      disableUI();

      Map<String, Object> message = new HashMap<>();
      message.put("type", "DEVICE_BLE_CONNECT");
      message.put("deviceId", device.deviceId);
      mSilkService.postMessage(message);
    }
  };

  /**
   * Handle Remove button click
   */
  private OnClickListener removeButtonListener = new View.OnClickListener() {
    public void onClick(View v) {
      // Attempt device removal
      Device device = (Device) deviceListSpinner.getSelectedItem();
      device.waitingForResponse = true;
      disableUI();

      Map<String, Object> message = new HashMap<>();
      message.put("type", "DEVICE_REMOVE");
      message.put("deviceId", device.deviceId);
      mSilkService.postMessage(message);
    }
  };

  /**
   * Hide keyboard when clicked outside of the EditText
   */
  private View.OnFocusChangeListener focusChangeListener = new View.OnFocusChangeListener() {
    @Override
    public void onFocusChange(View view, boolean hasFocus) {
      if (!hasFocus) {
        hideKeyboard(view);
      }
    }
  };

  private void hideKeyboard(View view) {
    InputMethodManager inputMethodManager = (InputMethodManager)getSystemService(Activity.INPUT_METHOD_SERVICE);
    inputMethodManager.hideSoftInputFromWindow(view.getWindowToken(), 0);
  }

  /**
   * Display selected device status
   */
  private AdapterView.OnItemSelectedListener deviceSelectedListener = new AdapterView.OnItemSelectedListener() {
    @Override
    public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
      Device device = (Device) parent.getItemAtPosition(position);
      updateUI(device);
    }

    @Override
    public void onNothingSelected(AdapterView<?> parent) {
      echoButton.setEnabled(false);
      configureButton.setEnabled(false);
      deviceStatusTextView.setText("");
    }
  };

  /**
   * Update the state of various buttons such as config and echo
   * @param device
   */
  private void updateUI(final Device device) {
    runOnUiThread(new Runnable() {
      public void run() {
        deviceStatusTextView.setText(device.status());

        if (device.waitingForResponse) {
          return;
        }
        deviceListSpinner.setEnabled(true);

        if (device.rtcConnectionStatus != null &&
          device.rtcConnectionStatus.equals("CONNECTED")) {
          echoButton.setEnabled(true);
        } else {
          echoButton.setEnabled(false);
        }

        if (device.deviceConfigStatus.equals("UNCONFIGURED")) {
          configureButton.setText(getString(R.string.configure));
          configureButton.setEnabled(device.deviceConfigId != null);
          removeButton.setEnabled(false);
        } else {
          configureButton.setText(getString(R.string.reconfigure));
          configureButton.setEnabled(true);
          removeButton.setEnabled(true);
        }

        if (device.rtcConnectionError != null &&
          device.rtcConnectionError.equals("UNAUTHORIZED")) {
          authorizeButton.setEnabled(true);
        } else {
          authorizeButton.setEnabled(false);
        }
      }
    });
  }

  /**
   * Disable all UI buttons
   */
  private void disableUI() {
    runOnUiThread(new Runnable() {
      public void run() {
        echoButton.setEnabled(false);
        configureButton.setEnabled(false);
        removeButton.setEnabled(false);
        authorizeButton.setEnabled(false);
        deviceListSpinner.setEnabled(false);
      }
    });
  }

  /**
   * Select the deviceListSpinner item that was previously selected
   *
   * @param value
   */
  private void selectDeviceListSpinnerItem(String value) {
    ArrayAdapter<Device> adapter = (ArrayAdapter<Device>) deviceListSpinner.getAdapter();
    for (int position = 0; position < adapter.getCount(); position++) {
      Device device = (Device) adapter.getItem(position);
      if (device.toString().equals(value)) {
        deviceListSpinner.setSelection(position);
        return;
      }
    }
  }

  /**
   * Select the ssidListSpinner item that was previously selected
   *
   * @param value
   */
  private void selectSsidListSpinnerItem(String value) {
    ArrayAdapter<String> adapter = (ArrayAdapter<String>) ssidListSpinner.getAdapter();
    for (int position = 0; position < adapter.getCount(); position++) {
      String ssid = adapter.getItem(position).toString();
      if (ssid.equals(value)) {
        ssidListSpinner.setSelection(position);
        break;
      }
    }

    final Button button = wifiDialog.getButton(AlertDialog.BUTTON_POSITIVE);
    if (button != null) {
      final Device device = (Device) deviceListSpinner.getSelectedItem();
      boolean enabled =
        device != null && ssidListSpinner.getSelectedItem() != null;
      if (enabled) {
        if (device.deviceConfigStatus.equals("CONFIGURED")) {
          enabled = device.bleConnectionStatus.equals("CONNECTED");
        } else {
          enabled = device.deviceId != null;
        }
      }
      button.setEnabled(enabled);
    }
  }

  /**
   * Display selected device status
   */
  private AdapterView.OnItemSelectedListener ssidSelectedListener = new AdapterView.OnItemSelectedListener() {
    @Override
    public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
      final Device device = (Device) deviceListSpinner.getSelectedItem();
      final Button button = wifiDialog.getButton(AlertDialog.BUTTON_POSITIVE);
      button.setEnabled(device != null && device.deviceId != null);
    }

    @Override
    public void onNothingSelected(AdapterView<?> parent) {
      final Button button = wifiDialog.getButton(AlertDialog.BUTTON_POSITIVE);
      button.setEnabled(false);
    }
  };

  /**
   * Display error messge dialog
   * @param errorMsg
   */
  private void onError(final String errorMsg) {
    runOnUiThread(new Runnable() {
      public void run() {
        AlertDialog alertDialog = new AlertDialog.Builder(MainActivity.this).create();
        alertDialog.setTitle("Error");
        alertDialog.setMessage(errorMsg);
        alertDialog.setButton(AlertDialog.BUTTON_NEUTRAL, "OK",
          new DialogInterface.OnClickListener() {
            public void onClick(DialogInterface dialog, int which) {
              dialog.dismiss();
            }
          });
        alertDialog.show();
      }
    });
  }

  private void onSuccess(final String msg) {
    runOnUiThread(new Runnable() {
      public void run() {
        AlertDialog alertDialog = new AlertDialog.Builder(MainActivity.this).create();
        alertDialog.setTitle("Success");
        alertDialog.setMessage(msg);
        alertDialog.setButton(AlertDialog.BUTTON_NEUTRAL, "OK",
          new DialogInterface.OnClickListener() {
            public void onClick(DialogInterface dialog, int which) {
              dialog.dismiss();
            }
          });
        alertDialog.show();
      }
    });
  }

  /**
   * Handle signin result from google login
   * @param result
   */
  private void handleSignInResult(GoogleSignInResult result) {
    Log.d(TAG, "handleSignInResult:" + result.isSuccess());
    if (result.isSuccess()) {
      // Signed in successfully
      GoogleSignInAccount acct = result.getSignInAccount();
      String idToken = acct.getIdToken();
      onGoogleAuthStatusChanged(acct.getDisplayName());
      Log.d(TAG, "idToken:" + idToken);

      Map<String, Object> message = new HashMap<>();
      message.put("type", "ACCOUNT_LOGIN");
      message.put("source", "google");
      message.put("token", idToken);
      mSilkService.postMessage(message);

    } else {
      // Signed out
      onError("Failed to login to google account. " + result.getStatus().getStatusMessage());
    }
  }

  /**
   * Handle google auth status result
   * @param authStatus
   */
  private void onGoogleAuthStatusChanged(final String authStatus) {
    runOnUiThread(new Runnable() {
      public void run() {
        googleAuthStatusTextView.setText(authStatus);
      }
    });
  }

  @Override
  public void onConnectionFailed(@NonNull ConnectionResult connectionResult) {
    Log.d(TAG, "onConnectionFailed:" + connectionResult);
  }

  public Device getDeviceByDeviceId(String deviceId) {
    final Device device =  (Device) deviceListSpinner.getSelectedItem();
    if (device == null) {
      return null;
    }

    if (!device.deviceId.equals(deviceId)) {
      return null;
    }
    return device;
  }

  public Device getDeviceByDeviceConfigId(Integer deviceConfigId) {
    final Device device =  (Device) deviceListSpinner.getSelectedItem();
    if (device == null) {
      return null;
    }

    if (device.deviceConfigId == null ||
      !device.deviceConfigId.equals(deviceConfigId)) {
      return null;
    }
    return device;
  }
}
