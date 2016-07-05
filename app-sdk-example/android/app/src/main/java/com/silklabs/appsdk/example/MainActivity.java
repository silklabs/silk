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

import com.silklabs.appsdk.SilkAppSDKService;
import com.silklabs.appsdk.SilkAppSDKDelegate;

public class MainActivity extends Activity {

  private final String TAG = "SilkAppSDKExample";

  private SilkAppSDKService mSilkService = null;
  private ServiceConnection mSilkServiceConnection = new ServiceConnection() {
    @Override
    public void onServiceConnected(ComponentName name, IBinder serviceBinder) {
      mSilkService = ((SilkAppSDKService.ServiceBinder)serviceBinder).getService();
      mSilkService.start(new SilkAppSDKDelegate() {
        @Override
        public void onMessage(Bundle message) {
          Log.i(TAG, "Received message: " + message.toString());
          // Send the message right back.
          mSilkService.postMessage(message);
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
        Bundle message = new Bundle();
        message.putString("type", "BUTTON_PRESS");
        mSilkService.postMessage(message);
      }
    });

    startService(new Intent(this, SilkAppSDKService.class)); // keep service alive for duration of process
    bindService(new Intent(this, SilkAppSDKService.class), mSilkServiceConnection, Context.BIND_AUTO_CREATE);
  }

}
