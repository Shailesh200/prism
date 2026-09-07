#import <AppKit/AppKit.h>
#import <Foundation/Foundation.h>

@interface PrismNotifyDelegate : NSObject <NSUserNotificationCenterDelegate>
@end

@implementation PrismNotifyDelegate
- (void)openConsole:(NSString *)url {
  if (url.length == 0) return;
  NSURL *parsed = [NSURL URLWithString:url];
  BOOL opened = parsed && [[NSWorkspace sharedWorkspace] openURL:parsed];
  if (opened) return;
  NSTask *task = [[NSTask alloc] init];
  task.launchPath = @"/usr/bin/open";
  task.arguments = @[ url ];
  @try {
    [task launch];
  } @catch (NSException *ex) {
    (void)ex;
  }
}

- (void)userNotificationCenter:(NSUserNotificationCenter *)center
       didActivateNotification:(NSUserNotification *)notification {
  NSString *url = notification.userInfo[@"url"];
  [self openConsole:url];
  [center removeDeliveredNotification:notification];
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.5 * NSEC_PER_SEC)),
                 dispatch_get_main_queue(), ^{
                   exit(0);
                 });
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

    [NSApplication sharedApplication];
    [NSApp setActivationPolicy:NSApplicationActivationPolicyProhibited];

    PrismNotifyDelegate *delegate = [PrismNotifyDelegate new];
    NSUserNotificationCenter *center =
        [NSUserNotificationCenter defaultUserNotificationCenter];
    center.delegate = delegate;

    NSUserNotification *note = [NSUserNotification new];
    note.title = @"Prism";
    note.subtitle = title;
    note.informativeText = body;
    note.soundName = NSUserNotificationDefaultSoundName;
    note.hasActionButton = YES;
    note.actionButtonTitle = @"Show";
    if (url.length > 0) {
      note.userInfo = @{@"url" : url};
    }
    [center deliverNotification:note];

    [[NSRunLoop currentRunLoop]
        runUntilDate:[NSDate dateWithTimeIntervalSinceNow:300]];
  }
  return 0;
}
