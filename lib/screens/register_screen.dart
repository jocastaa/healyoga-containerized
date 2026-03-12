import 'package:flutter/material.dart';
import 'package:lottie/lottie.dart';
import 'main_navigation_screen.dart';
import 'login_screen.dart';
import '../services/global_audio_service.dart';
import '../services/api_service.dart';
import '../l10n/app_localizations.dart';
import '../main.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _nameController = TextEditingController();
  final _ageController = TextEditingController();

  String _preferredSessionLength = '15 minutes';
  String _preferredLanguage = 'English';
  bool _pushNotifications = true;
  bool _isLoading = false;
  int _currentStep = 0;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _nameController.dispose();
    _ageController.dispose();
    super.dispose();
  }

  String _getErrorMessage(dynamic error) {
    final msg = error.toString().toLowerCase();
    if (msg.contains('already') || msg.contains('duplicate') || msg.contains('409')) {
      return AppLocalizations.of(context)!.emailAlreadyExists;
    } else if (msg.contains('password')) {
      return AppLocalizations.of(context)!.weakPassword;
    } else if (msg.contains('email')) {
      return AppLocalizations.of(context)!.errEmailInvalid;
    } else if (msg.contains('network') || msg.contains('connection')) {
      return AppLocalizations.of(context)!.networkError;
    }
    return AppLocalizations.of(context)!.unknownError;
  }

  Future<void> _register() async {
    final email = _emailController.text.trim();
    final password = _passwordController.text;

    // Client-side validation (matches auth-service rules)
    if (email.isEmpty || !email.contains('@') || !email.contains('.')) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(AppLocalizations.of(context)!.errEmailInvalid)));
      return;
    }
    if (password.length < 8) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Password must be at least 8 characters')));
      return;
    }
    if (!password.contains(RegExp(r'[A-Z]'))) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Password must contain at least 1 uppercase letter')));
      return;
    }
    if (!password.contains(RegExp(r'[a-z]'))) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Password must contain at least 1 lowercase letter')));
      return;
    }
    if (!password.contains(RegExp(r'[0-9]'))) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Password must contain at least 1 number')));
      return;
    }
    if (!password.contains(RegExp(r'[!@#$%^&*(),.?\":{}|<>]'))) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Password must contain at least 1 special character')));
      return;
    }

    final int? age = int.tryParse(_ageController.text.trim());
    if (age == null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(AppLocalizations.of(context)!.errAgeEmpty)));
      return;
    }

    setState(() => _isLoading = true);
    try {
      // ── Call auth-service via API Gateway ──────────────────────────────
      await ApiService().register(
        email: email,
        password: password,
        fullName: _nameController.text.trim(),
        age: age,
      );

      // Auto-login after successful registration
      await ApiService().login(email: email, password: password);

      // Update profile with preferences captured during registration
      final userId = ApiService().userId!;
      await ApiService().updateProfile(userId, {
        'preferredLanguage': _preferredLanguage == 'English' ? 'en'
            : _preferredLanguage == 'Mandarin (Simplified)' ? 'zh-Hans'
            : 'zh-Hant',
        'pushNotificationsEnabled': _pushNotifications,
      });

      // Sync locale
      if (_preferredLanguage == 'Mandarin (Simplified)') {
        appLocale.value = const Locale.fromSubtags(languageCode: 'zh', scriptCode: 'Hans');
      } else if (_preferredLanguage == 'Mandarin (Traditional)') {
        appLocale.value = const Locale.fromSubtags(languageCode: 'zh', scriptCode: 'Hant');
      } else {
        appLocale.value = const Locale('en');
      }

      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(AppLocalizations.of(context)!.welcomeName(_nameController.text.trim())),
            backgroundColor: const Color(0xFF40E0D0),
          ),
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
          SnackBar(content: Text(_getErrorMessage(e)), backgroundColor: Colors.red, duration: const Duration(seconds: 4)),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(_getErrorMessage(e)), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _nextStep() {
    if (_currentStep == 0) {
      if (_nameController.text.trim().isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(AppLocalizations.of(context)!.errNameEmpty)));
        return;
      }
      final age = int.tryParse(_ageController.text.trim());
      if (age == null || age < 1 || age > 120) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(AppLocalizations.of(context)!.errAgeRange)));
        return;
      }
    }
    if (_currentStep < 2) setState(() => _currentStep++);
  }

  void _previousStep() {
    if (_currentStep > 0) setState(() => _currentStep--);
  }

  void _showLanguageDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(AppLocalizations.of(context)!.changeLanguage),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(title: const Text('English'), onTap: () { appLocale.value = const Locale('en'); Navigator.pop(context); }),
          ListTile(title: const Text('简体中文'), onTap: () {
            appLocale.value = const Locale.fromSubtags(languageCode: 'zh', scriptCode: 'Hans');
            Navigator.pop(context);
          }),
          ListTile(title: const Text('繁體中文'), onTap: () {
            appLocale.value = const Locale.fromSubtags(languageCode: 'zh', scriptCode: 'Hant');
            Navigator.pop(context);
          }),
        ]),
      ),
    );
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
          child: Stack(children: [
            SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
              child: Column(children: [
                const SizedBox(height: 10),
                SizedBox(height: 140, child: _buildStepAnimation()),
                const SizedBox(height: 10),
                Text(AppLocalizations.of(context)!.registerTitle,
                    style: const TextStyle(fontSize: 26, fontWeight: FontWeight.bold, color: Colors.white),
                    textAlign: TextAlign.center),
                const SizedBox(height: 10),
                Text(AppLocalizations.of(context)!.registerSubtitle,
                    style: const TextStyle(color: Colors.white70, fontSize: 16), textAlign: TextAlign.center),
                const SizedBox(height: 25),
                // Step indicators
                Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                  _buildStepIndicator(0, AppLocalizations.of(context)!.stepPersonal),
                  _buildStepLine(0),
                  _buildStepIndicator(1, AppLocalizations.of(context)!.stepPreferences),
                  _buildStepLine(1),
                  _buildStepIndicator(2, AppLocalizations.of(context)!.stepAccount),
                ]),
                const SizedBox(height: 25),
                Container(
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(24),
                    boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.1), blurRadius: 20, offset: const Offset(0, 10))],
                  ),
                  child: _buildStepContent(),
                ),
                const SizedBox(height: 20),
                Row(children: [
                  if (_currentStep > 0) ...[
                    Expanded(
                      child: OutlinedButton(
                        onPressed: _isLoading ? null : () async {
                          await GlobalAudioService.playClickSound();
                          _previousStep();
                        },
                        style: OutlinedButton.styleFrom(
                          backgroundColor: Colors.red,
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                        ),
                        child: Text(AppLocalizations.of(context)!.back,
                            style: const TextStyle(color: Colors.black, fontSize: 16, fontWeight: FontWeight.w600)),
                      ),
                    ),
                    const SizedBox(width: 12),
                  ],
                  Expanded(
                    child: ElevatedButton(
                      onPressed: _isLoading ? null : () async {
                        await GlobalAudioService.playClickSound();
                        _currentStep < 2 ? _nextStep() : _register();
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: turquoise,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                      ),
                      child: _isLoading
                          ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : Text(
                              _currentStep < 2 ? AppLocalizations.of(context)!.continueButton : AppLocalizations.of(context)!.createAccount,
                              style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                            ),
                    ),
                  ),
                ]),
                const SizedBox(height: 20),
                TextButton(
                  onPressed: _isLoading ? null : () async {
                    await GlobalAudioService.playClickSound();
                    Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const LoginScreen()));
                  },
                  child: Text(AppLocalizations.of(context)!.alreadyHaveAccount,
                      style: const TextStyle(color: Colors.black87, fontWeight: FontWeight.w600)),
                ),
              ]),
            ),
            Positioned(
              top: 16, right: 16,
              child: IconButton(
                iconSize: 32,
                icon: Container(
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(color: Colors.black.withOpacity(0.3), shape: BoxShape.circle),
                  child: const Icon(Icons.language, color: Colors.white, size: 28),
                ),
                onPressed: () { GlobalAudioService.playClickSound(); _showLanguageDialog(); },
              ),
            ),
          ]),
        ),
      ),
    );
  }

  Widget _buildStepAnimation() {
    switch (_currentStep) {
      case 0: return Lottie.network('https://lottie.host/4d498849-4530-4e3f-8ccd-b236f1adfd5b/A0bBqkmU5s.json', fit: BoxFit.contain);
      case 1: return Lottie.network('https://lottie.host/30cd278d-76cf-45b1-b586-efce4269ff30/IgVs13JkK4.json', fit: BoxFit.contain);
      case 2: return Lottie.network('https://lottie.host/b882a045-2582-4815-90ce-0591a1d2434c/URk6v1m8VD.json', fit: BoxFit.contain);
      default: return Lottie.network('https://lottie.host/4f447e6f-2fd4-4d3d-bb0f-8185fbdaa182/1ZqHgsZMiH.json', fit: BoxFit.contain);
    }
  }

  Widget _buildStepIndicator(int step, String label) {
    final isActive = _currentStep == step;
    final isCompleted = _currentStep > step;
    return Column(children: [
      Container(
        width: 40, height: 40,
        decoration: BoxDecoration(
          color: isCompleted || isActive ? Colors.white : Colors.white38,
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white, width: 2),
        ),
        child: Center(
          child: isCompleted
              ? const Icon(Icons.check, color: Color(0xFF40E0D0), size: 20)
              : Text('${step + 1}', style: TextStyle(color: isActive ? const Color(0xFF40E0D0) : Colors.white70, fontWeight: FontWeight.bold)),
        ),
      ),
      const SizedBox(height: 4),
      Text(label, style: TextStyle(color: isActive ? Colors.white : Colors.white60, fontSize: 11, fontWeight: isActive ? FontWeight.w600 : FontWeight.normal)),
    ]);
  }

  Widget _buildStepLine(int step) {
    return Container(width: 40, height: 2, margin: const EdgeInsets.only(bottom: 20), color: _currentStep > step ? Colors.white : Colors.white38);
  }

  Widget _buildStepContent() {
    switch (_currentStep) {
      case 0: return _buildPersonalInfoStep();
      case 1: return _buildPreferencesStep();
      case 2: return _buildAccountStep();
      default: return _buildPersonalInfoStep();
    }
  }

  Widget _buildPersonalInfoStep() {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(AppLocalizations.of(context)!.getToknowYou, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Color(0xFF40E0D0))),
      const SizedBox(height: 8),
      Text(AppLocalizations.of(context)!.tellUsAbout, style: const TextStyle(fontSize: 14, color: Colors.black54)),
      const SizedBox(height: 24),
      _buildIconField(icon: Icons.person_outline, label: AppLocalizations.of(context)!.fullName, controller: _nameController, hint: AppLocalizations.of(context)!.nameHint),
      const SizedBox(height: 16),
      _buildIconField(icon: Icons.cake_outlined, label: AppLocalizations.of(context)!.age, controller: _ageController, hint: AppLocalizations.of(context)!.ageHint, keyboardType: TextInputType.number),
    ]);
  }

  Widget _buildPreferencesStep() {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(AppLocalizations.of(context)!.yourPreferences, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Color(0xFF40E0D0))),
      const SizedBox(height: 8),
      Text(AppLocalizations.of(context)!.customizeYoga, style: const TextStyle(fontSize: 14, color: Colors.black54)),
      const SizedBox(height: 24),
      _buildDropdownCard(icon: Icons.timer_outlined, label: AppLocalizations.of(context)!.sessionLength, value: _preferredSessionLength,
          items: const ['5 minutes', '10 minutes', '15 minutes', '20 minutes', '30 minutes'],
          onChanged: (v) => setState(() => _preferredSessionLength = v!)),
      const SizedBox(height: 16),
      _buildDropdownCard(icon: Icons.language, label: AppLocalizations.of(context)!.language, value: _preferredLanguage,
          items: const ['English', 'Mandarin (Simplified)', 'Mandarin (Traditional)'],
          onChanged: (v) => setState(() => _preferredLanguage = v!)),
      const SizedBox(height: 16),
      Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: const Color(0xFF40E0D0).withOpacity(0.1), borderRadius: BorderRadius.circular(12)),
        child: Row(children: [
          Container(padding: const EdgeInsets.all(8), decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(8)),
              child: const Icon(Icons.notifications_active_outlined, color: Color(0xFF40E0D0), size: 24)),
          const SizedBox(width: 12),
          Expanded(child: Text(AppLocalizations.of(context)!.enableNotifications, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: Colors.black87))),
          Switch(value: _pushNotifications, onChanged: (v) => setState(() => _pushNotifications = v), activeThumbColor: const Color(0xFF40E0D0)),
        ]),
      ),
    ]);
  }

  Widget _buildAccountStep() {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(AppLocalizations.of(context)!.secureAccount, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Color(0xFF40E0D0))),
      const SizedBox(height: 8),
      Text(AppLocalizations.of(context)!.createCredentials, style: const TextStyle(fontSize: 14, color: Colors.black54)),
      const SizedBox(height: 24),
      _buildIconField(icon: Icons.email_outlined, label: AppLocalizations.of(context)!.email, controller: _emailController,
          hint: AppLocalizations.of(context)!.emailHint, keyboardType: TextInputType.emailAddress),
      const SizedBox(height: 16),
      _buildIconField(icon: Icons.lock_outline, label: AppLocalizations.of(context)!.password, controller: _passwordController,
          hint: AppLocalizations.of(context)!.passwordHint, obscureText: true),
      const SizedBox(height: 16),
      Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: Colors.blue.shade50, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.blue.shade200)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Icon(Icons.info_outline, color: Colors.blue.shade700, size: 20),
            const SizedBox(width: 8),
            Text(AppLocalizations.of(context)!.passwordReqTitle, style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.blue.shade900)),
          ]),
          const SizedBox(height: 6),
          _buildPasswordRequirement(AppLocalizations.of(context)!.reqLength),
          _buildPasswordRequirement(AppLocalizations.of(context)!.reqUpper),
          _buildPasswordRequirement(AppLocalizations.of(context)!.reqLower),
          _buildPasswordRequirement(AppLocalizations.of(context)!.reqNumber),
          _buildPasswordRequirement(AppLocalizations.of(context)!.reqSpecial),
        ]),
      ),
    ]);
  }

  Widget _buildIconField({required IconData icon, required String label, required TextEditingController controller,
      String? hint, bool obscureText = false, TextInputType keyboardType = TextInputType.text}) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Icon(icon, size: 20, color: const Color(0xFF40E0D0)),
        const SizedBox(width: 8),
        Text(label, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: Colors.black87)),
      ]),
      const SizedBox(height: 8),
      TextField(
        controller: controller, obscureText: obscureText, keyboardType: keyboardType, enabled: !_isLoading,
        decoration: InputDecoration(
          hintText: hint, hintStyle: TextStyle(color: Colors.grey.shade400), filled: true, fillColor: Colors.white,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: Colors.grey.shade400, width: 1.5)),
          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: Colors.grey.shade400, width: 1.5)),
          focusedBorder: const OutlineInputBorder(borderRadius: BorderRadius.all(Radius.circular(12)), borderSide: BorderSide(color: Color(0xFF40E0D0), width: 2.5)),
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        ),
      ),
    ]);
  }

  Widget _buildDropdownCard({required IconData icon, required String label, required String value,
      required List<String> items, required ValueChanged<String?>? onChanged}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.grey.shade400, width: 1.5)),
      child: Row(children: [
        Container(padding: const EdgeInsets.all(8), decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(8)),
            child: Icon(icon, color: const Color(0xFF40E0D0), size: 20)),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label, style: const TextStyle(fontSize: 12, color: Colors.black54, fontWeight: FontWeight.w500)),
            DropdownButton<String>(
              value: value, isExpanded: true, underline: const SizedBox(),
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: Colors.black87),
              items: items.map((item) => DropdownMenuItem(value: item, child: Text(item))).toList(),
              onChanged: _isLoading ? null : onChanged,
              onTap: () => GlobalAudioService.playClickSound(),
            ),
          ]),
        ),
      ]),
    );
  }

  Widget _buildPasswordRequirement(String text) {
    return Padding(
      padding: const EdgeInsets.only(left: 8, top: 4),
      child: Row(children: [
        Icon(Icons.check_circle_outline, size: 14, color: Colors.blue.shade700),
        const SizedBox(width: 6),
        Text(text, style: TextStyle(fontSize: 11, color: Colors.blue.shade900)),
      ]),
    );
  }
}
