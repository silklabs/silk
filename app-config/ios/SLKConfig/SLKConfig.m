#import "SLKConfig.h"

static NSString *const SLK_DEBUG_DEFAULT = @"silk*";

@implementation SLKConfig
{
  NSString *_debug;
  NSURL *_jsBundleURL;
}

RCT_EXPORT_MODULE()

- (instancetype)init
{
  if ((self = [super init])) {
    _debug = SLK_DEBUG_DEFAULT;
    _jsBundleURL = [[NSBundle bundleForClass:[SLKConfig class]] URLForResource:@"main" withExtension:@"jsbundle"];
    [self load];
  }
  return self;
}

- (void)load
{
  NSURL *configURL = [[NSBundle bundleForClass:[SLKConfig class]] URLForResource:@"config.local" withExtension:@"json"];
  if (!configURL) {
    return;
  }
  NSData *data = [NSData dataWithContentsOfURL:configURL];
  if (!data) {
    return;
  }
  [self loadFromData:data];
}

- (void)loadFromData:(NSData *)data
{
  NSError *error;
  NSDictionary *config = [NSJSONSerialization JSONObjectWithData:data options:kNilOptions error:&error];
  if (error) {
    return;
  }

  if (config[@"debug"]) {
    _debug = config[@"debug"];
  }

  NSDictionary* reactNative = config[@"react-native"];
  if (reactNative) {
    NSString *bundleType = reactNative[@"type"];
    if ([bundleType isEqualToString:@"remote"]) {
      NSString *host = reactNative[@"host"] ?: @"localhost";
      NSString *port = reactNative[@"port"] ?: @"8081";
      NSString *url = [NSString stringWithFormat:@"http://%@:%@/%@.bundle?platform=ios&dev=true", host, port, SLK_JS_BUNDLE_ENTRY_FILE];
      NSLog(@"Using remote JS bundle: %@", url);
      _jsBundleURL = [NSURL URLWithString:url];
    }
  }
}

@end
