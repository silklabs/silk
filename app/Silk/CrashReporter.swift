/**
 * Raygun-based crash reporter for iOS native
 *
 * Copyright (c) 2015 Silk Labs, Inc
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */


public class CrashReporter {
  static public func start() {

    // Try to load the Raygun api key.  config.raygun.json will only exist in
    // |version.official| builds thanks to |./tools/official_build|
    let url = NSBundle.mainBundle().URLForResource("config.raygun.json", withExtension: "")
    if url == nil {
      NSLog("Native crash reporting disabled in non-official builds")
      return
    }

    let result: AnyObject?
    do {
      result = try NSJSONSerialization.JSONObjectWithData(
        NSData(contentsOfURL: url!)!,
        options: []
      )
    } catch let error as NSError {
      NSLog(error.localizedDescription)
      return
    }

    if let jsonDict = result {
      if let apiKey = jsonDict["apiKey"] as? String {
        Raygun.sharedReporterWithApiKey(apiKey)
        // Got the key, enable crash reporting.
        NSLog("Native crash reporting enabled")
      }
    }
  }
}
