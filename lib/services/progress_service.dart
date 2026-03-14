import 'api_service.dart';
import '../models/user_progress.dart';

class ProgressService {
  final ApiService _api = ApiService();

  // Get user progress from backend service
  Future<UserProgress> getUserProgress(String userId) async {
    try {
      final data = await _api.get('/progress/$userId');
      return UserProgress.fromJson(data);
    } catch (e) {
      print('Error getting user progress: $e');
      rethrow;
    }
  }

  // Update progress after completing a session
  Future<UserProgress> completeSession(String userId, String level) async {
    try {
      final data = await _api.post(
        '/progress/$userId/complete',
        {'level': level},
      );

      return UserProgress.fromJson(data);
    } catch (e) {
      print('Error completing session: $e');
      rethrow;
    }
  }

  // Manually unlock a level (admin/testing purposes)
  Future<void> unlockLevel(String userId, String level) async {
    try {
      await _api.post(
        '/progress/$userId/unlock',
        {'level': level},
      );
    } catch (e) {
      print('Error unlocking level: $e');
      rethrow;
    }
  }

  // Reset progress (for testing)
  Future<void> resetProgress(String userId) async {
    try {
      await _api.post(
        '/progress/$userId/reset',
        {},
      );
    } catch (e) {
      print('Error resetting progress: $e');
      rethrow;
    }
  }
}