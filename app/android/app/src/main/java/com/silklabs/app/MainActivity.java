package com.silklabs.app;

import com.silklabs.app.SilkReactPackage;

import com.facebook.react.ReactActivity;
import com.facebook.react.ReactPackage;
import com.facebook.react.shell.MainReactPackage;

import java.util.Arrays;
import java.util.List;

public class MainActivity extends ReactActivity {

  /**
   * Returns the file path of the main module. This is only used during
   * development. In release builds, the JS bundle ships as an asset, as
   * determined by getBundleAssetName().
   */
  @Override
  protected String getJSMainModuleName() {
    return "src/index";
  }

  /**
   * Returns the name of the main component registered from JavaScript.
   * This is used to schedule rendering of the component.
   */
  @Override
  protected String getMainComponentName() {
    return "Silk";
  }

  /**
   * Returns whether dev mode should be enabled.
   * This enables e.g. the dev menu.
   */
  @Override
  protected boolean getUseDeveloperSupport() {
    return BuildConfig.DEBUG;
  }

   /**
  * A list of packages used by the app. If the app uses additional views
  * or modules besides the default ones, add more packages here.
  */
  @Override
  protected List<ReactPackage> getPackages() {
    return Arrays.<ReactPackage>asList(
      new MainReactPackage(),
      new SilkReactPackage());
  }

}
