import 'api_service.dart';

class PoseProgressService {
  final ApiService _api = ApiService();

  Future<bool> isPoseCompleted(
      String userId,
      String sessionLevel,
      String poseId,
      ) async {
    try {
      return await _api.isPoseCompleted(
        userId: userId,
        sessionLevel: sessionLevel,
        poseId: poseId,
      );
    } catch (e) {
      print('Error checking pose completion: $e');
      return false;
    }
  }

  Future<void> markPoseCompleted(
      String userId,
      String sessionLevel,
      String poseId,
      ) async {
    try {
      await _api.markPoseCompleted(
        userId: userId,
        sessionLevel: sessionLevel,
        poseId: poseId,
      );
    } catch (e) {
      print('Error marking pose completed: $e');
      rethrow;
    }
  }

  Future<List<String>> getCompletedPosesForLevel(
      String userId,
      String sessionLevel,
      ) async {
    try {
      final rows = await _api.getPoseProgress(
        userId: userId,
        sessionLevel: sessionLevel,
      );

      return rows
          .where((item) => item['pose_id'] != null)
          .map((item) => item['pose_id'].toString())
          .toList();
    } catch (e) {
      print('Error getting completed poses: $e');
      return [];
    }
  }

   // Reset all poses for a level
  Future<void> resetLevelPoseProgress(
    String userId,
    String sessionLevel,
  ) async {
    try {
      await _api.delete('/poses/$userId/reset/$sessionLevel');
    } catch (e) {
      print('Error resetting pose progress: $e');
      rethrow;
    }
  }

  // Reset all levels
  Future<void> resetUserPoseProgress(String userId) async {
    try {
      const levels = ['Beginner', 'Intermediate', 'Advanced'];

      for (final level in levels) {
        await _api.delete('/poses/$userId/reset/$level');
      }
    } catch (e) {
      print('Error resetting all pose progress: $e');
      rethrow;
    }
  }
}