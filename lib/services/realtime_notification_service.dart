import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'notification_service.dart';
import 'api_service.dart';

/// Listens to new rows in notification_logs for the current user via
/// Supabase Realtime. When a new row arrives, shows a local notification.
/// Auto-retries if Supabase Realtime is still initializing (free tier cold start).
class RealtimeNotificationService {
  static final RealtimeNotificationService _instance =
  RealtimeNotificationService._internal();
  factory RealtimeNotificationService() => _instance;
  RealtimeNotificationService._internal();

  final _supabase = Supabase.instance.client;
  RealtimeChannel? _channel;
  String? _subscribedUserId;
  Timer? _retryTimer;
  int _retryCount = 0;
  static const int _maxRetries = 10;
  static const Duration _retryDelay = Duration(seconds: 5);

  /// Call this after login. Safe to call multiple times.
  void subscribe() {
    final userId = ApiService().userId;
    if (userId == null) return;

    // Already subscribed for this user
    if (_subscribedUserId == userId && _channel != null) return;

    _retryCount = 0;
    _doSubscribe(userId);
  }

  void _doSubscribe(String userId) {
    if (_channel != null) {
      _supabase.removeChannel(_channel!);
      _channel = null;
    }

    debugPrint('🔔 RealtimeNotificationService: subscribing for user $userId (attempt ${_retryCount + 1})');

    _channel = _supabase
        .channel('notification_logs:$userId:$_retryCount')
        .onPostgresChanges(
      event: PostgresChangeEvent.insert,
      schema: 'public',
      table: 'notification_logs',
      filter: PostgresChangeFilter(
        type: PostgresChangeFilterType.eq,
        column: 'user_id',
        value: userId,
      ),
      callback: (payload) {
        final row = payload.newRecord;
        final title = row['title'] as String? ?? 'HealYoga';
        final body  = row['body']  as String? ?? '';
        debugPrint('🔔 Realtime notification received: $title');
        NotificationService().showNotification(title: title, body: body);
      },
    )
        .subscribe((status, [error]) {
      debugPrint('🔔 Realtime channel status: $status');
      if (error != null) debugPrint('🔔 Realtime error: $error');

      if (status == RealtimeSubscribeStatus.subscribed) {
        _retryTimer?.cancel();
        _retryTimer = null;
        _retryCount = 0;
        _subscribedUserId = userId;
        debugPrint('🔔 Realtime: connected ✅');
      } else if (status == RealtimeSubscribeStatus.channelError ||
          status == RealtimeSubscribeStatus.timedOut) {
        if (_retryCount < _maxRetries) {
          _retryCount++;
          debugPrint('🔔 Realtime: retrying in ${_retryDelay.inSeconds}s (attempt $_retryCount/$_maxRetries)');
          _retryTimer?.cancel();
          _retryTimer = Timer(_retryDelay, () => _doSubscribe(userId));
        } else {
          debugPrint('🔔 Realtime: max retries reached, giving up.');
        }
      }
    });
  }

  /// Call this on logout.
  void unsubscribe() {
    _retryTimer?.cancel();
    _retryTimer = null;
    _retryCount = 0;
    if (_channel != null) {
      _supabase.removeChannel(_channel!);
      _channel = null;
      _subscribedUserId = null;
      debugPrint('🔔 RealtimeNotificationService: unsubscribed');
    }
  }
}