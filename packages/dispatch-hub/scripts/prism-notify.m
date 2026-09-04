#import <AppKit/AppKit.h>
#import <Foundation/Foundation.h>

@interface PrismNotifyDelegate : NSObject <NSUserNotificationCenterDelegate>
@end

@implementation PrismNotifyDelegate
- (void)userNotificationCenter:(NSUserNotificationCenter *)center
       didActivateNotification:(NSUserNotification *)notification {
  NSString *url = notification.userInfo[@"url"];
  if (url.length > 0) {
    NSURL *parsed = [NSURL URLWithString:url];
    if (parsed) {
      [[NSWorkspace sharedWorkspace] openURL:parsed];
    }
  }
  [center removeDeliveredNotification:notification];
  exit(0);
}

- (BOOL)userNotificationCenter:(NSUserNotificationCenter *)center
     shouldPresentNotification:(NSUserNotification *)notification {
  (void)center;
  (void)notification;
  return YES;
}
@end

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    if (argc < 3) return 1;
    NSString *title = [NSString stringWithUTF8String:argv[1]];
    NSString *body = [NSString stringWithUTF8String:argv[2]];
    NSString *url = argc > 3 ? [NSString stringWithUTF8String:argv[3]] : @"";

    PrismNotifyDelegate *delegate = [PrismNotifyDelegate new];
    NSUserNotificationCenter *center =
        [NSUserNotificationCenter defaultUserNotificationCenter];
    center.delegate = delegate;

    NSUserNotification *note = [NSUserNotification new];
    note.title = @"Prism";
    note.subtitle = title;
    note.informativeText = body;
    note.soundName = NSUserNotificationDefaultSoundName;
    if (url.length > 0) {
      note.userInfo = @{@"url" : url};
    }
    [center deliverNotification:note];

    [[NSRunLoop currentRunLoop]
        runUntilDate:[NSDate dateWithTimeIntervalSinceNow:300]];
  }
  return 0;
}
