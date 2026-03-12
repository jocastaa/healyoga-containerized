// lib/services/api_service.dart
// Central HTTP client for all microservice calls via the API Gateway.
// Replace Supabase SDK calls with these methods in auth-related screens.

import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

class ApiService {
  static const String _baseUrl = 'https://healy-api-gateway.onrender.com';

  // ─── Singleton ────────────────────────────────────────────────────────────
  static final ApiService _instance = ApiService._internal();
  factory ApiService() => _instance;
  ApiService._internal();

  // In-memory session store (persists for app lifetime)
  String? _accessToken;
  String? _userId;
  String? _userEmail;

  String? get accessToken => _accessToken;
  String? get userId => _userId;
  String? get userEmail => _userEmail;
  bool get isLoggedIn => _accessToken != null && _userId != null;

  // ─── Internal HTTP helpers ────────────────────────────────────────────────
  Map<String, String> get _headers => {
    'Content-Type': 'application/json',
    if (_accessToken != null) 'Authorization': 'Bearer $_accessToken',
  };

  Future<Map<String, dynamic>> _post(String path, Map<String, dynamic> body) async {
    try {
      final res = await http.post(
        Uri.parse('$_baseUrl$path'),
        headers: _headers,
        body: jsonEncode(body),
      ).timeout(const Duration(seconds: 60));
      return _parse(res);
    } catch (e) {
      throw ApiException('Network error: $e');
    }
  }

  Future<Map<String, dynamic>> _get(String path) async {
    try {
      final res = await http.get(
        Uri.parse('$_baseUrl$path'),
        headers: _headers,
      ).timeout(const Duration(seconds: 60));
      return _parse(res);
    } catch (e) {
      throw ApiException('Network error: $e');
    }
  }

  Future<Map<String, dynamic>> _put(String path, Map<String, dynamic> body) async {
    try {
      final res = await http.put(
        Uri.parse('$_baseUrl$path'),
        headers: _headers,
        body: jsonEncode(body),
      ).timeout(const Duration(seconds: 60));
      return _parse(res);
    } catch (e) {
      throw ApiException('Network error: $e');
    }
  }

  Map<String, dynamic> _parse(http.Response res) {
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    if (res.statusCode >= 400) {
      // Collect error message from service response
      final msg = data['error'] ??
          (data['errors'] as List?)?.join(', ') ??
          'Request failed (${res.statusCode})';
      throw ApiException(msg, statusCode: res.statusCode);
    }
    return data;
  }

  // ─── Auth endpoints ───────────────────────────────────────────────────────

  /// Register a new user. Creates auth + profile row.
  Future<Map<String, dynamic>> register({
    required String email,
    required String password,
    required String fullName,
    int? age,
    String? experienceLevel,
    String? preferredLanguage,
    String? preferredSessionLength,
    bool? pushNotificationsEnabled,
  }) async {
    final data = await _post('/auth/register', {
      'email': email,
      'password': password,
      'fullName': fullName,
      if (age != null) 'age': age,
      if (experienceLevel != null) 'experienceLevel': experienceLevel,
      if (preferredLanguage != null) 'preferredLanguage': preferredLanguage,
      if (preferredSessionLength != null) 'preferredSessionLength': preferredSessionLength,
      if (pushNotificationsEnabled != null)
        'pushNotificationsEnabled': pushNotificationsEnabled,
    });
    return data;
  }

  /// Login and persist session in memory.
  Future<void> login({
    required String email,
    required String password,
  }) async {
    final data = await _post('/auth/login', {
      'email': email,
      'password': password,
    });
    _accessToken = data['accessToken'] as String? ?? data['access_token'] as String?;
    _userId = data['userId'] as String? ?? data['user_id'] as String?;
    _userEmail = data['email'] as String?;

    if (_accessToken == null || _userId == null) {
      throw ApiException('Login response missing accessToken or userId');
    }
    debugPrint('✅ Logged in: userId=$_userId');
  }

  /// Logout and clear local session.
  Future<void> logout() async {
    try {
      await _post('/auth/logout', {});
    } catch (_) {
      // Best-effort logout
    } finally {
      _accessToken = null;
      _userId = null;
      _userEmail = null;
    }
  }

  /// Send password reset email.
  Future<void> resetPassword(String email) async {
    await _post('/auth/reset-password', {'email': email});
  }

  /// Fetch profile for [userId].
  Future<Map<String, dynamic>> getProfile(String userId) async {
    return await _get('/auth/profile/$userId');
  }

  /// Update profile fields for [userId].
  Future<void> updateProfile(String userId, Map<String, dynamic> fields) async {
    await _put('/auth/profile/$userId', fields);
  }
}

// ─── Custom exception ─────────────────────────────────────────────────────────
class ApiException implements Exception {
  final String message;
  final int? statusCode;
  ApiException(this.message, {this.statusCode});

  @override
  String toString() => message;
}

// ─── Pose endpoints ─────────────────────────────────────────────────────

Future<List<dynamic>> getPoseProgress({
  required String userId,
  required String sessionLevel,
}) async {
  final data = await _get('/poses/$userId/$sessionLevel');
  return (data['poses'] as List?) ?? [];
}

Future<bool> isPoseCompleted({
  required String userId,
  required String sessionLevel,
  required String poseId,
}) async {
  final data = await _get('/poses/$userId/$sessionLevel/$poseId');
  return data['completed'] == true;
}

Future<void> markPoseCompleted({
  required String userId,
  required String sessionLevel,
  required String poseId,
}) async {
  await _post('/poses/$userId/complete', {
    'sessionLevel': sessionLevel,
    'poseId': poseId,
  });
}

Future<void> recordPoseActivity({
  required String userId,
  required String poseId,
  required String poseName,
  required int durationSeconds,
  required String sessionLevel,
}) async {
  await _post('/poses/$userId/activity', {
    'poseId': poseId,
    'poseName': poseName,
    'durationSeconds': durationSeconds,
    'sessionLevel': sessionLevel,
  });
}