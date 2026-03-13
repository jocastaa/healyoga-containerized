// Use the modern package:web for Flutter 3.x+
import 'package:web/web.dart' as web;
import 'dart:js_interop';

class WebNotificationHelper {
  static Future<bool> show({
    required String title,
    required String body,
    String? icon,
  }) async {
    // Check current permission
    final currentPermission = web.Notification.permission;
    debugLog('WebNotification: current permission=$currentPermission');

    if (currentPermission != 'granted') {
      // requestPermission() returns a JS Promise — must be awaited properly
      final result = await web.Notification.requestPermission().toDart;
      debugLog('WebNotification: permission result=$result');
      if (result != 'granted') {
        debugLog('WebNotification: permission not granted ($result)');
        return false;
      }
    }

    try {
      web.Notification(
        title,
        web.NotificationOptions(body: body, icon: icon ?? ''),
      );
      return true;
    } catch (e) {
      debugLog('WebNotification: failed to show notification: $e');
      return false;
    }
  }

  static void debugLog(String msg) {
    // ignore: avoid_print
    print(msg);
  }
}