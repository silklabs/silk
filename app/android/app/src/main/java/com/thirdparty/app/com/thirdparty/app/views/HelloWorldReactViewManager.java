package com.thirdparty.app.com.thirdparty.app.views;

import android.support.annotation.Nullable;

import com.facebook.react.common.MapBuilder;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;

import java.util.Map;

public class HelloWorldReactViewManager extends SimpleViewManager<HelloWorldReactView> {

  @Override
  public String getName() {
    return "TPYHelloWorldReactView";
  }

  @Override
  public @Nullable Map getExportedCustomDirectEventTypeConstants() {
    return MapBuilder.of("onButtonPress", MapBuilder.of("registrationName", "onButtonPress"));
  }

  @Override public HelloWorldReactView createViewInstance(final ThemedReactContext context) {
    return new HelloWorldReactView(context);
  }
}
