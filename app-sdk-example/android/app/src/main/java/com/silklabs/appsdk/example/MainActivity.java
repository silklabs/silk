package com.silklabs.appsdk.example;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.os.Bundle;
import android.os.IBinder;
import android.util.Log;
import android.view.View;
import android.view.inputmethod.InputMethodManager;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.EditText;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.view.View.OnClickListener;

import com.silklabs.appsdk.SilkAppSDKService;
import com.silklabs.appsdk.SilkAppSDKDelegate;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;

public class MainActivity extends Activity {

  private final String TAG = "SilkAppSDKExample";

  private SilkAppSDKService mSilkService = null;
  private TextView networkStatusView = null;
  private TextView authStatusView = null;
  private EditText emailText = null;
  private EditText passwordText = null;
  private Spinner deviceListSpinner = null;


  private ServiceConnection mSilkServiceConnection = new ServiceConnection() {
    @Override
    public void onServiceConnected(ComponentName name, IBinder serviceBinder) {
      mSilkService = ((SilkAppSDKService.ServiceBinder)serviceBinder).getService();
      mSilkService.start(new SilkAppSDKDelegate() {
        @Override
        public void onMessage(Map<String, Object> message) {
          Log.i(TAG, "Received message from SDK: " + message.toString());
          String messageType = message.get("type").toString();

          switch(messageType) {
            case "CLIENT_STATUS": {
              Object clientConnectionError = message.get("clientConnectionError");
              if (clientConnectionError == null) {
                String clientConnectionStatus = message.get("clientConnectionStatus").toString();
                onNetworkStatusChanged(clientConnectionStatus);
              } else {
                onError(clientConnectionError.toString());
              }

              Object clientAuthError = message.get("clientAuthError");
              if (clientAuthError == null) {
                String clientAuthStatus = message.get("clientAuthStatus").toString();
                onAuthStatusChanged(clientAuthStatus);
              } else {
                onError(clientAuthError.toString());
              }
              break;
            }
            case "DEVICE_LIST":
              onDeviceListAvailable((ArrayList<Map<String, Object>>) message.get("devices"));
              break;
            case "MESSAGE_ERROR": {
              String errorMsg = message.get("error").toString();
              onError(errorMsg);
              break;
            }
            case "DEVICE_MESSAGE_ERROR": {
              String errorMsg = message.get("error").toString();
              String deviceId = message.get("deviceId").toString();
              onError("device (" + deviceId.substring(0, 5) + "...)" + ": " + errorMsg);
              break;
            }
            default:
              Log.w(TAG, "Unknown message type: " + messageType);
          }
        }
      });
    }

    /**
     * Handle clientConnectionStatus part of CLIENT_STATUS message
     * @param networkStatus
     */
    private void onNetworkStatusChanged(final String networkStatus) {
      runOnUiThread(new Runnable() {
        public void run() {
          if (networkStatusView != null) {
            networkStatusView.setText(networkStatus);
          }
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
          if (authStatusView != null) {
            authStatusView.setText(authStatus);
          }
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
          ArrayList<String> deviceIds = new ArrayList<String>();
          for (int i = 0; i < devices.size(); i++) {
            Map<String, Object> device = devices.get(i);
            String deviceId = device.get("deviceId").toString();
            deviceIds.add(deviceId);
          }
          ArrayAdapter<String> adapter = new ArrayAdapter<String>(getBaseContext(),
              android.R.layout.simple_spinner_item, deviceIds);
          adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
          deviceListSpinner.setAdapter(adapter);
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

    setContentView(R.layout.main);
    networkStatusView = (TextView) findViewById(R.id.networkStatusResultView);
    authStatusView = (TextView) findViewById(R.id.authStatusResultView);

    emailText = (EditText) findViewById(R.id.emailText);
    emailText.setOnFocusChangeListener(focusChangeListener);

    passwordText = (EditText) findViewById(R.id.passwordText);
    passwordText.setOnFocusChangeListener(focusChangeListener);

    deviceListSpinner = (Spinner) findViewById(R.id.deviceList);

    final Button loginButton = (Button) findViewById(R.id.loginButton);
    loginButton.setOnClickListener(loginButtonListener);

    final Button logoutButton = (Button) findViewById(R.id.logoutButton);
    logoutButton.setOnClickListener(logoutButtonListener);

    final Button echoButton = (Button) findViewById(R.id.sendEchoMessageButton);
    echoButton.setOnClickListener(echoButtonListener);

    startService(new Intent(this, SilkAppSDKService.class)); // keep service alive for duration of process
    bindService(new Intent(this, SilkAppSDKService.class), mSilkServiceConnection, Context.BIND_AUTO_CREATE);
  }

  protected void onPause() {
    super.onPause();
    if (mSilkService != null) {
      unbindService(mSilkServiceConnection);
    }
  }

  /**
   * Handle Login button click
   */
  private OnClickListener loginButtonListener = new View.OnClickListener() {
    public void onClick(View v) {
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
   * Handle Logout button click
   */
  private OnClickListener logoutButtonListener = new View.OnClickListener() {
    public void onClick(View v) {
      Map<String, Object> message = new HashMap<>();
      message.put("type", "ACCOUNT_LOGOUT");
      mSilkService.postMessage(message);
    }
  };

  /**
   * Handle Send echo button click
   */
  private OnClickListener echoButtonListener = new View.OnClickListener() {
    public void onClick(View v) {
      if (deviceListSpinner.getSelectedItem() == null) {
        onError("Please select a device");
        return;
      }
      Map<String, Object> message = new HashMap<>();
      message.put("type", "DEVICE_MESSAGE");
      message.put("deviceId", deviceListSpinner.getSelectedItem().toString());
      message.put("payload", "{\"message\": \"Love the app\"}");
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
        InputMethodManager inputMethodManager =(InputMethodManager)getSystemService(Activity.INPUT_METHOD_SERVICE);
        inputMethodManager.hideSoftInputFromWindow(view.getWindowToken(), 0);
      }
    }
  };

  /**
   * Display error messge dialog
   * @param errorMsg
   */
  private void onError(String errorMsg) {
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
}
