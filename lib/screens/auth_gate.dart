import 'package:flutter/material.dart';
import 'login_screen.dart';
import 'main_navigation_screen.dart';
import 'complete_profile_screen.dart';
import 'splash_screen.dart';
import '../services/api_service.dart';
import '../main.dart';

/// AuthGate — no longer depends on Supabase SDK.
/// Uses ApiService (in-memory session) to determine routing:
///   - No session  → LoginScreen
///   - Incomplete profile (no name/age) → CompleteProfileScreen
///   - Complete profile → MainNavigationScreen
class AuthGate extends StatefulWidget {
  const AuthGate({super.key});

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  bool _showSplash = true;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();

    // Show splash for 4.5 s, then check session
    Future.delayed(const Duration(milliseconds: 4500), () {
      if (mounted) setState(() => _showSplash = false);
      _checkAuthState();
    });
  }

  Future<void> _checkAuthState() async {
    final api = ApiService();

    // Not logged in — show login screen
    if (!api.isLoggedIn) {
      if (mounted) setState(() => _isLoading = false);
      return;
    }

    try {
      final profile = await api.getProfile(api.userId!);

      // Sync language preference
      final lang = profile['preferred_language'] ?? 'en';
      if (lang == 'zh-Hans' || lang == 'Mandarin (Simplified)') {
        appLocale.value = const Locale.fromSubtags(languageCode: 'zh', scriptCode: 'Hans');
      } else if (lang == 'zh-Hant' || lang == 'Mandarin (Traditional)') {
        appLocale.value = const Locale.fromSubtags(languageCode: 'zh', scriptCode: 'Hant');
      } else {
        appLocale.value = const Locale('en');
      }

      final fullName = (profile['full_name'] as String?)?.trim() ?? '';
      final age = profile['age'];
      final isIncomplete = fullName.isEmpty || age == null;

      if (!mounted) return;

      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (isIncomplete) {
          Navigator.pushAndRemoveUntil(
            context,
            MaterialPageRoute(
              builder: (_) => CompleteProfileScreen(
                fullName: fullName.isEmpty ? '' : fullName,
                email: profile['email'] ?? '',
              ),
            ),
                (_) => false,
          );
        } else {
          Navigator.pushAndRemoveUntil(
            context,
            MaterialPageRoute(builder: (_) => const MainNavigationScreen()),
                (_) => false,
          );
        }
      });
    } catch (e) {
      // Profile fetch failed (token expired, network, etc.) — go to login
      ApiService().logout();
    }

    if (mounted) setState(() => _isLoading = false);
  }

  @override
  Widget build(BuildContext context) {
    if (_showSplash) return const SplashScreen();

    if (_isLoading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    // Not logged in
    if (!ApiService().isLoggedIn) return const LoginScreen();

    // Fallback (navigation handled in _checkAuthState via postFrameCallback)
    return const Scaffold(body: SizedBox.shrink());
  }
}