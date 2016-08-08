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
import android.widget.Button;
import android.widget.TextView;
import android.app.AlertDialog;
import android.content.DialogInterface;

import com.silklabs.appsdk.SilkAppSDKService;
import com.silklabs.appsdk.SilkAppSDKDelegate;

import java.util.HashMap;
import java.util.Map;

public class MainActivity extends Activity {

  private final String TAG = "SilkAppSDKExample";

  private SilkAppSDKService mSilkService = null;
  private TextView networkStatusView = null;
  private TextView authStatusView = null;

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
            case "CLIENT_STATUS":
              Log.i(TAG, "Handling CLIENT_STATUS");
              Object clientConnectionError = message.get("clientConnectionError");
              if (clientConnectionError == null) {
                String clientConnectionStatus = message.get("clientConnectionStatus").toString();
                onNetworkStatusChanged(clientConnectionStatus);
              } else {
                onNetworkStatusChanged(clientConnectionError.toString());
              }

              Object clientAuthError = message.get("clientAuthError");
              if (clientAuthError == null) {
                String clientAuthStatus = message.get("clientAuthStatus").toString();
                onAuthStatusChanged(clientAuthStatus);
              } else {
                onAuthStatusChanged(clientAuthError.toString());
              }
              break;
            case "MESSAGE_ERROR":
              String errorMsg = message.get("error").toString();
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
              break;
            default:
              Log.w(TAG, "Unknown message type: " + messageType);
          }
        }
      });
    }

    private void onNetworkStatusChanged(final String networkStatus) {
      runOnUiThread(new Runnable() {
        public void run() {
          if (networkStatusView != null) {
            networkStatusView.setText(networkStatus);
          }
        }
      });
    }

    private void onAuthStatusChanged(final String authStatus) {
      runOnUiThread(new Runnable() {
        public void run() {
          if (authStatusView != null) {
            authStatusView.setText(authStatus);
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

    setContentView(R.layout.main);

    final Button button = (Button) findViewById(R.id.hello_world_button);
    button.setOnClickListener(new View.OnClickListener() {
      public void onClick(View v) {
        Map<String, Object> message = new HashMap<>();
        message.put("type", "HELLO_WORLD");
        mSilkService.postMessage(message);
      }
    });

    networkStatusView = (TextView) findViewById(R.id.networkStatusResultView);
    authStatusView = (TextView) findViewById(R.id.authStatusResultView);

    startService(new Intent(this, SilkAppSDKService.class)); // keep service alive for duration of process
    bindService(new Intent(this, SilkAppSDKService.class), mSilkServiceConnection, Context.BIND_AUTO_CREATE);
  }

  protected void onPause() {
    super.onPause();
    if (mSilkService != null) {
      unbindService(mSilkServiceConnection);
    }
  }

}
