import 'package:flutter/material.dart';
import 'package:lottie/lottie.dart';
import 'main_navigation_screen.dart';
import '../services/global_audio_service.dart';
import '../services/api_service.dart';
import '../l10n/app_localizations.dart';

class CompleteProfileScreen extends StatefulWidget {
  final String? fullName;
  final String? email;

  const CompleteProfileScreen({super.key, this.fullName, this.email});

  @override
  State<CompleteProfileScreen> createState() => _CompleteProfileScreenState();
}

class _CompleteProfileScreenState extends State<CompleteProfileScreen>
    with SingleTickerProviderStateMixin {
  final _nameController = TextEditingController();
  final _ageController = TextEditingController();
  String _experienceLevel = 'Beginner';
  String _preferredSessionLength = '15 minutes';
  String _preferredLanguage = 'English';
  bool _pushNotifications = true;
  bool _isLoading = false;

  late AnimationController _fadeController;
  late Animation<double> _fadeAnimation;

  @override
  void initState() {
    super.initState();
    _nameController.text = widget.fullName ?? '';
    _fadeController = AnimationController(vsync: this, duration: const Duration(milliseconds: 900));
    _fadeAnimation = CurvedAnimation(parent: _fadeController, curve: Curves.easeInOut);
    _fadeController.forward();
  }

  @override
  void dispose() {
    _fadeController.dispose();
    _nameController.dispose();
    _ageController.dispose();
    super.dispose();
  }

  Future<void> _saveProfile() async {
    final age = int.tryParse(_ageController.text.trim());
    if (age == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(AppLocalizations.of(context)!.enterValidAge)),
      );
      return;
    }

    if (!ApiService().isLoggedIn) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Session expired. Please log in again.')),
      );
      return;
    }

    setState(() => _isLoading = true);
    try {
      final userId = ApiService().userId!;

      // ── Call auth-service via API Gateway ──────────────────────────────
      await ApiService().updateProfile(userId, {
        'fullName': _nameController.text.trim(),
        'age': age,
        'experienceLevel': _experienceLevel,
        'preferredLanguage': _preferredLanguage == 'English' ? 'en'
            : _preferredLanguage == 'Mandarin (Simplified)' ? 'zh-Hans'
            : 'zh-Hant',
        'pushNotificationsEnabled': _pushNotifications,
      });

      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(AppLocalizations.of(context)!.profileCompleted)),
        );
        Navigator.pushAndRemoveUntil(
          context,
          MaterialPageRoute(builder: (_) => const MainNavigationScreen()),
              (route) => false,
        );
      }
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(AppLocalizations.of(context)!.saveProfileFailed(e.message))),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(AppLocalizations.of(context)!.saveProfileFailed(e.toString()))),
        );
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    const turquoise = Color(0xFF40E0D0);

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [Color(0xFF40E0D0), Colors.white],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
        ),
        child: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
            child: FadeTransition(
              opacity: _fadeAnimation,
              child: Column(crossAxisAlignment: CrossAxisAlignment.center, children: [
                const SizedBox(height: 30),
                Lottie.network('https://lottie.host/4d498849-4530-4e3f-8ccd-b236f1adfd5b/A0bBqkmU5s.json',
                    height: 180, repeat: true, animate: true),
                const SizedBox(height: 10),
                Text(AppLocalizations.of(context)!.completeProfileTitle,
                    style: const TextStyle(fontSize: 26, fontWeight: FontWeight.bold, color: Colors.white)),
                const SizedBox(height: 10),
                Text(AppLocalizations.of(context)!.completeProfileSubtitle,
                    style: const TextStyle(color: Colors.white70, fontSize: 16), textAlign: TextAlign.center),
                const SizedBox(height: 40),
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: Colors.white, borderRadius: BorderRadius.circular(24),
                    boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.1), blurRadius: 10, offset: const Offset(0, 5))],
                  ),
                  child: Column(children: [
                    _buildTextField(icon: Icons.person_outline, label: AppLocalizations.of(context)!.fullName, controller: _nameController),
                    _buildTextField(icon: Icons.cake_outlined, label: AppLocalizations.of(context)!.age, controller: _ageController, keyboardType: TextInputType.number),
                    const SizedBox(height: 16),
                    _buildDropdown(icon: Icons.fitness_center, label: AppLocalizations.of(context)!.experienceLevel,
                        value: _experienceLevel, items: const ['Beginner', 'Intermediate', 'Advanced'],
                        onChanged: (v) => setState(() => _experienceLevel = v!)),
                    const SizedBox(height: 16),
                    _buildDropdown(icon: Icons.timer_outlined, label: AppLocalizations.of(context)!.sessionLength,
                        value: _preferredSessionLength,
                        items: const ['5 minutes', '10 minutes', '15 minutes', '20 minutes', '30 minutes'],
                        onChanged: (v) => setState(() => _preferredSessionLength = v!)),
                    const SizedBox(height: 16),
                    _buildDropdown(icon: Icons.language, label: AppLocalizations.of(context)!.preferredLanguage,
                        value: _preferredLanguage,
                        items: const ['English', 'Mandarin (Simplified)', 'Mandarin (Traditional)'],
                        onChanged: (v) => setState(() => _preferredLanguage = v!)),
                    const SizedBox(height: 16),
                    Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                      Text(AppLocalizations.of(context)!.enableNotifications,
                          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                      Switch(value: _pushNotifications, onChanged: (v) => setState(() => _pushNotifications = v),
                          activeThumbColor: turquoise),
                    ]),
                    const SizedBox(height: 24),
                    SizedBox(
                      width: double.infinity, height: 50,
                      child: ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: turquoise,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                        ),
                        onPressed: _isLoading ? null : () async {
                          await GlobalAudioService.playClickSound();
                          _saveProfile();
                        },
                        child: _isLoading
                            ? const CircularProgressIndicator(color: Colors.white)
                            : Text(AppLocalizations.of(context)!.continueButton,
                            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white)),
                      ),
                    ),
                  ]),
                ),
              ]),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildTextField({required IconData icon, required String label, required TextEditingController controller,
    TextInputType keyboardType = TextInputType.text}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: TextField(
        controller: controller, keyboardType: keyboardType,
        decoration: InputDecoration(
          labelText: label,
          prefixIcon: Icon(icon, color: const Color(0xFF40E0D0)),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
          focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF40E0D0))),
        ),
      ),
    );
  }

  Widget _buildDropdown({required IconData icon, required String label, required String value,
    required List<String> items, required ValueChanged<String?> onChanged}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(borderRadius: BorderRadius.circular(14), border: Border.all(color: Colors.grey.shade400)),
      child: Row(children: [
        Icon(icon, color: const Color(0xFF40E0D0)),
        const SizedBox(width: 12),
        Expanded(
          child: DropdownButton<String>(
            value: value, isExpanded: true, underline: const SizedBox(),
            style: const TextStyle(color: Colors.black87, fontSize: 16),
            items: items.map((item) => DropdownMenuItem(value: item, child: Text(item))).toList(),
            onChanged: onChanged,
            onTap: () => GlobalAudioService.playClickSound(),
          ),
        ),
      ]),
    );
  }
}