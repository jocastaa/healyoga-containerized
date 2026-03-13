import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/data/latest.dart' as tz;
import 'package:timezone/timezone.dart' as tz;
import 'package:flutter/foundation.dart';
import 'dart:async';

import '../services/api_service.dart';
import 'notification_web_stub.dart'
if (dart.library.html) 'notification_web.dart';

class NotificationService {
  // Singleton pattern
  static final NotificationService _instance = NotificationService._internal();
  factory NotificationService() => _instance;
  NotificationService._internal();

  // Flutter local notifications plugin instance
  final FlutterLocalNotificationsPlugin notificationsPlugin =
  FlutterLocalNotificationsPlugin();

  // Keep track of active timers for the web so we can cancel them if needed
  final Map<int, Timer> _webTimers = {};

  // Initialize the notification service
  Future<void> init() async {
    if (kIsWeb) {
      debugPrint('🌐 Web Notification Service Initialized');
      return;
    }

    tz.initializeTimeZones();

    // Attempt to set local timezone for correct scheduled notifications.
    // Some devices may report a timeZoneName that doesn't match TZ database keys.
    final now = DateTime.now();
    final offset = now.timeZoneOffset;
    final name = now.timeZoneName;

    try {
      final location = tz.getLocation(name);
      tz.setLocalLocation(location);
      debugPrint('✅ Timezone set to $name (from DateTime.timeZoneName)');
    } catch (_) {
      // Fallback: match by offset (best-effort)
      final match = tz.timeZoneDatabase.locations.entries.firstWhere((entry) {
        try {
          return tz.TZDateTime.now(entry.value).timeZoneOffset == offset;
        } catch (_) {
          return false;
        }
      }, orElse: () => MapEntry('UTC', tz.UTC));
      tz.setLocalLocation(match.value);
      debugPrint('✅ Timezone set to ${match.key} (matched offset $offset)');
    }

    const AndroidInitializationSettings androidSettings =
    AndroidInitializationSettings('@mipmap/ic_launcher');

    const InitializationSettings settings = InitializationSettings(
      android: androidSettings,
    );

    await notificationsPlugin.initialize(
      settings,
      onDidReceiveNotificationResponse: (details) {
        debugPrint('Notification tapped: ${details.payload}');
      },
    );

    await _requestPermissions();
    await _createNotificationChannels();

    debugPrint('✅ Notification service initialized');
  }

  // Request necessary permissions for Android
  Future<void> _requestPermissions() async {
    if (kIsWeb) return;
    final androidPlugin = notificationsPlugin
        .resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin
    >();

    await androidPlugin?.requestNotificationsPermission();

    try {
      await androidPlugin?.requestExactAlarmsPermission();
    } catch (_) {
      debugPrint(
        'requestExactAlarmsPermission not available — '
            'update flutter_local_notifications.',
      );
    }
  }

  // Create notification channels for Android
  Future<void> _createNotificationChannels() async {
    if (kIsWeb) return;
    const AndroidNotificationChannel dailyChannel = AndroidNotificationChannel(
      'daily_yoga_reminder_channel',
      'Daily Yoga Exercise Reminders',
      description: 'Daily reminders for yoga practice',
      importance: Importance.max,
      playSound: true,
      enableVibration: true,
      showBadge: true,
    );

    final androidPlugin = notificationsPlugin
        .resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin
    >();

    await androidPlugin?.createNotificationChannel(dailyChannel);

    debugPrint('✅ Notification channels created');
  }

  // Returns the default [NotificationDetails] used across all notifications
  NotificationDetails _notificationDetails() {
    return const NotificationDetails(
      android: AndroidNotificationDetails(
        'daily_yoga_reminder_channel',
        'Daily Yoga Exercise Reminders',
        importance: Importance.max,
        priority: Priority.high,
        showWhen: true,
        icon: 'zencore_icon',
        largeIcon: DrawableResourceAndroidBitmap('zencore_icon'),
      ),
    );
  }

  // Web notification helper (delegates to platform-specific implementation)
  Future<bool> _showWebNotification(String? title, String? body) async {
    WebNotificationHelper.show(
      title: title ?? 'HealYoga',
      body: body ?? '',
      icon: '/icons/zencore_icon.png',
    );
    return true;
  }

  // Show an immediate notification. Returns true if shown (web) or on success (native).
  Future<bool> showNotification({
    int id = 0,
    String? title,
    String? body,
    String? payload,
  }) async {
    if (kIsWeb) {
      return _showWebNotification(title, body);
    } else {
      await notificationsPlugin.show(
        id,
        title,
        body,
        _notificationDetails(),
        payload: payload,
      );
      return true;
    }
  }

  // Schedule a daily recurring notification at a specific time.
  // Also persists the schedule to the notification-service backend.
  Future<void> scheduleDailyNotification({
    required int id,
    required String title,
    required String body,
    required int hour,
    required int minute,
  }) async {
    // ── Persist to notification microservice ──────────────────────────────
    final userId = ApiService().userId;
    if (userId != null) {
      try {
        await ApiService().scheduleDailyReminder(
          userId: userId,
          hour: hour,
          minute: minute,
        );
        debugPrint('✅ Reminder synced to notification-service ($hour:${minute.toString().padLeft(2, '0')})');
      } catch (e) {
        debugPrint('⚠️  Could not sync reminder to notification-service: $e');
        // Non-fatal — local notification still scheduled below
      }
    }

    if (kIsWeb) {
      // WEB: Use Dart Timer (works while tab is open)
      _webTimers[id]?.cancel();

      final now = DateTime.now();
      var scheduledDate = DateTime(now.year, now.month, now.day, hour, minute);
      if (scheduledDate.isBefore(now)) {
        scheduledDate = scheduledDate.add(const Duration(days: 1));
      }

      final delay = scheduledDate.difference(now);
      debugPrint('⏳ Web notification $id scheduled in ${delay.inMinutes} minutes');

      _webTimers[id] = Timer(delay, () {
        _showWebNotification(title, body);
        _webTimers[id] = Timer.periodic(const Duration(days: 1), (_) {
          _showWebNotification(title, body);
        });
      });
      return;
    }

    // MOBILE: Use native zoned schedule
    final scheduledTime = _nextInstanceOfTime(hour, minute);
    await notificationsPlugin.zonedSchedule(
      id,
      title,
      body,
      scheduledTime,
      _notificationDetails(),
      androidScheduleMode: AndroidScheduleMode.exactAllowWhileIdle,
      uiLocalNotificationDateInterpretation:
      UILocalNotificationDateInterpretation.absoluteTime,
      matchDateTimeComponents: DateTimeComponents.time,
    );
  }

  // If the time has passed today, returns tomorrow's time
  tz.TZDateTime _nextInstanceOfTime(int hour, int minute) {
    final tz.TZDateTime now = tz.TZDateTime.now(tz.local);
    tz.TZDateTime scheduledDate = tz.TZDateTime(
      tz.local,
      now.year,
      now.month,
      now.day,
      hour,
      minute,
    );

    if (scheduledDate.isBefore(now)) {
      scheduledDate = scheduledDate.add(const Duration(days: 1));
    }

    return scheduledDate;
  }

  // Cancel a specific notification by ID.
  // Also cancels the backend reminder if this is the daily reminder (id == 101).
  Future<void> cancelNotification(int id) async {
    // ── Cancel on notification microservice (daily reminder only) ─────────
    if (id == 101) {
      final userId = ApiService().userId;
      if (userId != null) {
        try {
          await ApiService().cancelDailyReminder(userId);
          debugPrint('✅ Reminder cancelled on notification-service');
        } catch (e) {
          debugPrint('⚠️  Could not cancel reminder on notification-service: $e');
        }
      }
    }

    if (kIsWeb) {
      _webTimers[id]?.cancel();
      _webTimers.remove(id);
    } else {
      await notificationsPlugin.cancel(id);
    }
    debugPrint('✅ Notification $id cancelled');
  }

  // Cancel all scheduled notifications
  Future<void> cancelAllNotifications() async {
    if (kIsWeb) {
      for (final timer in _webTimers.values) {
        timer.cancel();
      }
      _webTimers.clear();
    } else {
      await notificationsPlugin.cancelAll();
    }
    debugPrint('✅ All notifications cancelled');
  }
}