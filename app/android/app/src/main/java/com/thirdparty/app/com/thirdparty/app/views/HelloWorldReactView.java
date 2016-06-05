package com.thirdparty.app.com.thirdparty.app.views;

import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.common.SystemClock;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.UIManagerModule;
import com.facebook.react.uimanager.events.Event;
import com.facebook.react.uimanager.events.EventDispatcher;
import com.facebook.react.uimanager.events.RCTEventEmitter;

import com.silklabs.app.R;

/**
 * View that we manage through React. React-managed views are managed by a corresponding
 * ViewManager. See HelloWorldReactViewManager.
 *
 * We render an XML-based view as our only subview.
 */
public class HelloWorldReactView extends LinearLayout {

  // Simple example of how to pass data from native to React based on user
  // action. Here we pass a simple value (timestamp) back to React whenever
  // the button in the layout is pressed.

  class ButtonPressEvent extends Event<ButtonPressEvent> {

    public ButtonPressEvent(int viewTag) {
      super(viewTag, SystemClock.nanoTime());
    }

    @Override
    public String getEventName() {
      return "onButtonPress";
    }

    @Override
    public void dispatch(RCTEventEmitter rctEventEmitter) {
      WritableMap eventData = Arguments.createMap();
      eventData.putInt("target", getViewTag());
      eventData.putInt("timestampMs", (int) this.getTimestampMs());
      rctEventEmitter.receiveEvent(getViewTag(), getEventName(), eventData);
    }
  }

  public HelloWorldReactView(final ThemedReactContext context) {
    super(context);

    final View demoView = View.inflate(context, R.layout.hello_world_demo, null);
    addView(demoView, new LinearLayout.LayoutParams(
            LayoutParams.MATCH_PARENT,
            LayoutParams.MATCH_PARENT));

    final Button button = (Button) demoView.findViewById(R.id.hello_world_button);
    button.setOnClickListener(new View.OnClickListener() {
      public void onClick(View v) {
        final EventDispatcher eventDispatcher =
                context.getNativeModule(UIManagerModule.class).getEventDispatcher();
        eventDispatcher.dispatchEvent(new ButtonPressEvent(getId()));
      }
    });
  }

}
