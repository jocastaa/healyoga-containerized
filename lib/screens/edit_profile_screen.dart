import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'dart:io';
import 'package:image_picker/image_picker.dart';
import '../services/notification_service.dart';
import '../services/global_audio_service.dart';
import '../services/api_service.dart';
import 'package:volume_controller/volume_controller.dart';
import '../main.dart';
import '../l10n/app_localizations.dart';
import 'package:google_fonts/google_fonts.dart';

class EditProfileScreen extends StatefulWidget {
  const EditProfileScreen({super.key});

  @override
  State<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends State<EditProfileScreen> {
  // Keep supabase client ONLY for storage (avatar upload/remove)
  final supabase = Supabase.instance.client;

  bool get isWeb => MediaQuery.of(context).size.width > 600;

  final _nameController = TextEditingController();
  final _ageController = TextEditingController();
  String? _profileImageUrl;

  String _experienceLevel = 'Beginner';
  String _sessionLength = '15 minutes';
  String _language = 'English';

  bool _pushNotifications = true;
  bool _dailyPracticeReminder = true;
  String _reminderTime = '9:00 AM';
  bool _soundEffectsEnabled = true;
  double _volumeLevel = 0.8;
  double _previousVolume = 0.8;

  bool _isLoading = true;
  bool _isSaving = false;

  static const bool _isWebPlatform = kIsWeb;

  @override
  void initState() {
    super.initState();
    _loadProfile();
    _initVolumeController();
  }

  Future<void> _initVolumeController() async {
    if (_isWebPlatform) return;
    final currentVolume = await VolumeController.instance.getVolume();
    setState(() { _volumeLevel = currentVolume; _previousVolume = currentVolume; });
  }

  // ── Load profile via auth-service ─────────────────────────────────────────
  Future<void> _loadProfile() async {
    if (!ApiService().isLoggedIn) {
      setState(() => _isLoading = false);
      return;
    }

    try {
      final profile = await ApiService().getProfile(ApiService().userId!);

      _nameController.text = profile['full_name'] ?? '';
      _ageController.text = profile['age']?.toString() ?? '';
      _experienceLevel = profile['experience_level'] ?? 'Beginner';
      _sessionLength = profile['preferred_session_length'] ?? '15 minutes';

      // Normalise old language value
      String rawLang = profile['preferred_language'] ?? 'en';
      if (rawLang == 'en') {
        _language = 'English';
      } else if (rawLang == 'zh-Hans' || rawLang == 'Mandarin' || rawLang == 'Mandarin (Simplified)') {
        _language = 'Mandarin (Simplified)';
        appLocale.value = const Locale.fromSubtags(languageCode: 'zh', scriptCode: 'Hans');
      } else if (rawLang == 'zh-Hant' || rawLang == 'Mandarin (Traditional)') {
        _language = 'Mandarin (Traditional)';
        appLocale.value = const Locale.fromSubtags(languageCode: 'zh', scriptCode: 'Hant');
      } else {
        _language = 'English';
        appLocale.value = const Locale('en');
      }

      _pushNotifications = profile['push_notifications_enabled'] ?? true;
      _profileImageUrl = profile['profile_image_url'];
      _dailyPracticeReminder = profile['daily_practice_reminder'] ?? true;
      _reminderTime = profile['reminder_time'] ?? '9:00 AM';
      _soundEffectsEnabled = profile['sound_effects_enabled'] ?? true;

      final savedVolume = (profile['volume_level'] as num?)?.toDouble() ?? 0.8;
      setState(() { _volumeLevel = savedVolume; _previousVolume = savedVolume; });

      if (!_isWebPlatform) await VolumeController.instance.setVolume(savedVolume);
      await GlobalAudioService().setVolume(savedVolume);

      if (_dailyPracticeReminder) {
        try {
          final time = _parseTimeOfDay(_reminderTime);
          NotificationService().scheduleDailyNotification(
            id: 101,
            title: AppLocalizations.of(context)!.dailyReminderNotification,
            body: AppLocalizations.of(context)!.dailyReminderBody,
            hour: time.hour,
            minute: time.minute,
          );
        } catch (_) {}
      }
    } catch (e) {
      debugPrint('❌ Failed to load profile: $e');
    }

    setState(() => _isLoading = false);
  }

  TimeOfDay _parseTimeOfDay(String formatted) {
    final parts = formatted.trim().split(' ');
    if (parts.isEmpty) return const TimeOfDay(hour: 9, minute: 0);
    final timePart = parts[0];
    final period = parts.length > 1 ? parts[1].toUpperCase() : 'AM';
    final segments = timePart.split(':');
    var hour = int.tryParse(segments.first) ?? 9;
    final minute = segments.length > 1 ? int.tryParse(segments[1]) ?? 0 : 0;
    if (period == 'PM' && hour < 12) hour += 12;
    else if (period == 'AM' && hour == 12) hour = 0;
    return TimeOfDay(hour: hour, minute: minute);
  }

  // ── Avatar upload — still uses Supabase Storage directly ─────────────────
  Future<void> _pickAndUploadImage() async {
    final userId = ApiService().userId;
    if (userId == null) return;

    final picker = ImagePicker();
    final pickedFile = await picker.pickImage(source: ImageSource.gallery, imageQuality: 70);
    if (pickedFile == null) return;

    final filePath = '$userId/profile.jpg';
    try {
      if (_isWebPlatform) {
        final bytes = await pickedFile.readAsBytes();
        await supabase.storage.from('avatars').uploadBinary(filePath, bytes, fileOptions: const FileOptions(upsert: true));
      } else {
        final file = File(pickedFile.path);
        await supabase.storage.from('avatars').upload(filePath, file, fileOptions: const FileOptions(upsert: true));
      }

      final rawUrl = supabase.storage.from('avatars').getPublicUrl(filePath);
      final imageUrl = '$rawUrl?t=${DateTime.now().millisecondsSinceEpoch}';

      // Persist URL through auth-service
      await ApiService().updateProfile(ApiService().userId!, {'profileImageUrl': imageUrl});

      setState(() => _profileImageUrl = imageUrl);
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(AppLocalizations.of(context)!.photoUpdated)));
    } catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${AppLocalizations.of(context)!.photoFail}: $e')));
    }
  }

  Future<void> _removeProfileImage() async {
    final userId = ApiService().userId;
    if (userId == null) return;

    try {
      await supabase.storage.from('avatars').remove(['/profile.jpg']);
      await ApiService().updateProfile(ApiService().userId!, {'profileImageUrl': null});
      setState(() => _profileImageUrl = null);
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Profile image removed')));
    } catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to remove image: $e')));
    }
  }

  // ── Save profile via auth-service ─────────────────────────────────────────
  Future<void> _saveProfile() async {
    if (!ApiService().isLoggedIn) return;

    final age = int.tryParse(_ageController.text.trim());
    if (_nameController.text.trim().isEmpty || age == null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(AppLocalizations.of(context)!.validationError)));
      return;
    }

    setState(() => _isSaving = true);
    try {
      final userId = ApiService().userId!;

      // ── Save all profile fields via auth-service ──────────────────────────
      await ApiService().updateProfile(userId, {
        'fullName': _nameController.text.trim(),
        'age': age,
        'experienceLevel': _experienceLevel,
        'preferredSessionLength': _sessionLength,
        'preferredLanguage': _language == 'English' ? 'en'
            : _language == 'Mandarin (Simplified)' ? 'zh-Hans'
            : 'zh-Hant',
        'pushNotificationsEnabled': _pushNotifications,
        'dailyPracticeReminder': _dailyPracticeReminder,
        'reminderTime': _reminderTime,
        'soundEffectsEnabled': _soundEffectsEnabled,
        'volumeLevel': _volumeLevel,
      });

      // ── Sync daily reminder with notification service ─────────────────────
      if (_dailyPracticeReminder) {
        final time = _parseTimeOfDay(_reminderTime);
        await ApiService().scheduleDailyReminder(
          userId: userId,
          hour: time.hour,
          minute: time.minute,
        );
      } else {
        await ApiService().cancelDailyReminder(userId);
      }

      if (mounted) Navigator.pop(context);
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _ageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const turquoise = Color(0xFF40E0D0);

    if (_isLoading) {
      return Scaffold(
        body: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft, end: Alignment.bottomRight,
              colors: [Color(0xFFD4F1F0), Color(0xFFFFFFFF), Color(0xFFE8F9F3), Color(0xFFFFE9DB)],
              stops: [0.0, 0.3, 0.6, 1.0],
            ),
          ),
          child: const Center(child: CircularProgressIndicator(color: turquoise)),
        ),
      );
    }

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft, end: Alignment.bottomRight,
            colors: [Color(0xFFD4F1F0), Color(0xFFFFFFFF), Color(0xFFE8F9F3), Color(0xFFFFE9DB)],
            stops: [0.0, 0.3, 0.6, 1.0],
          ),
        ),
        child: SafeArea(
          child: Column(children: [
            Padding(
              padding: EdgeInsets.all(isWeb ? 24 : 20),
              child: Row(children: [
                IconButton(icon: const Icon(Icons.arrow_back, size: 28), onPressed: () => Navigator.pop(context), color: Colors.black87),
                const SizedBox(width: 12),
                Expanded(child: Text(AppLocalizations.of(context)!.editProfile,
                    style: GoogleFonts.poppins(fontSize: isWeb ? 32 : 26, fontWeight: FontWeight.bold, color: Colors.black87))),
                ElevatedButton(
                  onPressed: _isSaving ? null : () async { GlobalAudioService.playClickSound(); _saveProfile(); },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: turquoise, foregroundColor: Colors.white,
                    padding: EdgeInsets.symmetric(horizontal: isWeb ? 28 : 24, vertical: isWeb ? 14 : 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)), elevation: 0,
                  ),
                  child: Text(AppLocalizations.of(context)!.save, style: GoogleFonts.poppins(fontSize: isWeb ? 16 : 15, fontWeight: FontWeight.w600)),
                ),
              ]),
            ),
            Expanded(
              child: SingleChildScrollView(
                padding: EdgeInsets.symmetric(horizontal: isWeb ? 28 : 20),
                child: Column(children: [
                  // Profile image
                  Center(child: Stack(children: [
                    CircleAvatar(
                      radius: 60, backgroundColor: turquoise.withOpacity(0.2),
                      backgroundImage: _profileImageUrl != null ? NetworkImage(_profileImageUrl!) : null,
                      child: _profileImageUrl == null ? const Icon(Icons.person, size: 60, color: turquoise) : null,
                    ),
                    Positioned(
                      bottom: 0, right: 0,
                      child: PopupMenuButton<String>(
                        icon: Container(
                          padding: const EdgeInsets.all(8),
                          decoration: const BoxDecoration(color: turquoise, shape: BoxShape.circle),
                          child: const Icon(Icons.camera_alt, color: Colors.white, size: 20),
                        ),
                        onSelected: (value) {
                          if (value == 'upload') _pickAndUploadImage();
                          else if (value == 'remove') _removeProfileImage();
                        },
                        itemBuilder: (context) => [
                          PopupMenuItem(value: 'upload', child: Row(children: [
                            const Icon(Icons.upload, color: Color(0xFF2E6F68)), const SizedBox(width: 8),
                            Text(AppLocalizations.of(context)!.uploadPhoto),
                          ])),
                          if (_profileImageUrl != null)
                            PopupMenuItem(value: 'remove', child: Row(children: [
                              const Icon(Icons.delete, color: Colors.red), const SizedBox(width: 8),
                              Text(AppLocalizations.of(context)!.removePhoto),
                            ])),
                        ],
                      ),
                    ),
                  ])),
                  const SizedBox(height: 24),

                  // Basic info
                  _card(title: AppLocalizations.of(context)!.basicInfo, children: [
                    _textField(AppLocalizations.of(context)!.fullName, _nameController),
                    _textField(AppLocalizations.of(context)!.age, _ageController, keyboardType: TextInputType.number),
                    _dropdown(AppLocalizations.of(context)!.sessionLength, _sessionLength,
                        ['5 minutes', '10 minutes', '15 minutes', '20 minutes', '30 minutes'],
                            (v) => setState(() => _sessionLength = v),
                        itemLabelBuilder: (value) {
                          if (value == '5 minutes') return AppLocalizations.of(context)!.min5;
                          if (value == '10 minutes') return AppLocalizations.of(context)!.min10;
                          if (value == '15 minutes') return AppLocalizations.of(context)!.min15;
                          if (value == '20 minutes') return AppLocalizations.of(context)!.min20;
                          if (value == '30 minutes') return AppLocalizations.of(context)!.min30;
                          return value;
                        }),
                    _dropdown(AppLocalizations.of(context)!.language, _language,
                        ['English', 'Mandarin (Simplified)', 'Mandarin (Traditional)'],
                            (v) {
                          setState(() => _language = v);
                          if (v == 'Mandarin (Simplified)') {
                            appLocale.value = const Locale.fromSubtags(languageCode: 'zh', scriptCode: 'Hans');
                          } else if (v == 'Mandarin (Traditional)') {
                            appLocale.value = const Locale.fromSubtags(languageCode: 'zh', scriptCode: 'Hant');
                          } else {
                            appLocale.value = const Locale('en');
                          }
                        },
                        itemLabelBuilder: (value) {
                          if (value == 'English') return AppLocalizations.of(context)!.english;
                          if (value == 'Mandarin (Simplified)') return AppLocalizations.of(context)!.mandarinSimplified;
                          if (value == 'Mandarin (Traditional)') return AppLocalizations.of(context)!.mandarinTraditional;
                          return value;
                        }),
                  ]),

                  // Notifications
                  _card(title: AppLocalizations.of(context)!.notifications, children: [
                    SwitchListTile(
                        title: Text(AppLocalizations.of(context)!.pushNotifications),
                        value: _pushNotifications, activeThumbColor: turquoise,
                        onChanged: (v) async {
                          GlobalAudioService.playClickSound();
                          setState(() => _pushNotifications = v);
                          if (v == true) {
                            final shown = await NotificationService().showNotification(
                              title: 'HealYoga', body: AppLocalizations.of(context)!.pushEnabledMsg,
                            );
                            if (!shown && context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                                backgroundColor: Colors.redAccent,
                                content: Text('Notifications are blocked. Please enable them in your browser settings.'),
                                behavior: SnackBarBehavior.floating, duration: Duration(seconds: 4),
                              ));
                            }
                          }
                        }),
                    SwitchListTile(
                        title: Text(AppLocalizations.of(context)!.dailyReminder),
                        value: _dailyPracticeReminder, activeThumbColor: turquoise,
                        onChanged: (v) {
                          GlobalAudioService.playClickSound();
                          setState(() => _dailyPracticeReminder = v);
                          if (v) {
                            final time = _parseTimeOfDay(_reminderTime);
                            NotificationService().scheduleDailyNotification(
                              id: 101, title: AppLocalizations.of(context)!.dailyReminderNotification,
                              body: AppLocalizations.of(context)!.dailyReminderBody, hour: time.hour, minute: time.minute,
                            );
                            ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                              backgroundColor: turquoise,
                              content: Text('${AppLocalizations.of(context)!.dailyEnabledMsg} $_reminderTime'),
                              behavior: SnackBarBehavior.floating, duration: const Duration(seconds: 3),
                            ));
                          } else {
                            NotificationService().cancelNotification(101);
                          }
                        }),
                    ListTile(
                      title: Text(AppLocalizations.of(context)!.reminderTime),
                      trailing: Text(_reminderTime, style: const TextStyle(color: Color(0xFF6B8F8A))),
                      onTap: () async {
                        GlobalAudioService.playClickSound();
                        final time = await showTimePicker(context: context, initialTime: TimeOfDay.now());
                        if (time != null) {
                          setState(() => _reminderTime = time.format(context));
                          if (_dailyPracticeReminder) {
                            NotificationService().scheduleDailyNotification(
                              id: 101, title: AppLocalizations.of(context)!.dailyReminderNotification,
                              body: AppLocalizations.of(context)!.dailyReminderBody, hour: time.hour, minute: time.minute,
                            );
                          }
                        }
                      },
                    ),
                  ]),

                  // Sound
                  _card(title: AppLocalizations.of(context)!.sound, children: [
                    SwitchListTile(
                        title: Text(AppLocalizations.of(context)!.soundEffects),
                        value: _soundEffectsEnabled, activeThumbColor: turquoise,
                        onChanged: (v) {
                          setState(() => _soundEffectsEnabled = v);
                          GlobalAudioService.isSoundEffectsEnabled = v;
                          if (v) GlobalAudioService.playClickSound();
                        }),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                          Text(_isWebPlatform ? AppLocalizations.of(context)!.appVolume : AppLocalizations.of(context)!.systemVolume,
                              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w500, color: Color(0xFF2E6F68))),
                          Text('${(_volumeLevel * 100).round()}%', style: const TextStyle(fontSize: 14, color: Color(0xFF6B8F8A))),
                        ]),
                        const SizedBox(height: 8),
                        Row(children: [
                          IconButton(
                            icon: Icon(_volumeLevel == 0 ? Icons.volume_off : Icons.volume_mute, color: const Color(0xFF6B8F8A)),
                            onPressed: () async {
                              setState(() {
                                if (_volumeLevel > 0) { _previousVolume = _volumeLevel; _volumeLevel = 0; }
                                else { _volumeLevel = _previousVolume; }
                              });
                              if (!_isWebPlatform) await VolumeController.instance.setVolume(_volumeLevel);
                              await GlobalAudioService().setVolume(_volumeLevel);
                            },
                          ),
                          Expanded(child: Slider(
                            value: _volumeLevel, min: 0, max: 1, divisions: 10,
                            label: '${(_volumeLevel * 100).round()}%', activeColor: turquoise,
                            onChanged: (v) async {
                              setState(() => _volumeLevel = v);
                              if (!_isWebPlatform) await VolumeController.instance.setVolume(v);
                              await GlobalAudioService().setVolume(v);
                            },
                          )),
                          IconButton(
                            icon: const Icon(Icons.volume_up, color: Color(0xFF6B8F8A)),
                            onPressed: () async {
                              setState(() => _volumeLevel = 1.0);
                              if (!_isWebPlatform) await VolumeController.instance.setVolume(1.0);
                              await GlobalAudioService().setVolume(1.0);
                            },
                          ),
                        ]),
                        const SizedBox(height: 4),
                        Text(_isWebPlatform ? AppLocalizations.of(context)!.appVolumeDesc : AppLocalizations.of(context)!.systemVolumeDesc,
                            style: const TextStyle(fontSize: 12, color: Color(0xFF9CA3AF), fontStyle: FontStyle.italic)),
                      ]),
                    ),
                  ]),
                ]),
              ),
            ),
          ]),
        ),
      ),
    );
  }

  Widget _card({String? title, required List<Widget> children}) {
    return Container(
      margin: EdgeInsets.only(bottom: isWeb ? 20 : 16),
      padding: EdgeInsets.all(isWeb ? 28 : 24),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(24),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 10, offset: const Offset(0, 4))]),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (title != null) Padding(padding: const EdgeInsets.only(bottom: 16),
            child: Text(title, style: GoogleFonts.poppins(fontSize: isWeb ? 22 : 20, fontWeight: FontWeight.bold, color: const Color(0xFF2E6F68)))),
        ...children,
      ]),
    );
  }

  Widget _textField(String label, TextEditingController controller, {TextInputType keyboardType = TextInputType.text}) {
    return Padding(
      padding: EdgeInsets.only(bottom: isWeb ? 18 : 16),
      child: TextField(
        controller: controller, keyboardType: keyboardType,
        style: GoogleFonts.poppins(fontSize: isWeb ? 17 : 16),
        decoration: InputDecoration(
          labelText: label, labelStyle: TextStyle(fontSize: isWeb ? 16 : 15),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide(color: Colors.grey[300]!)),
          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: const BorderSide(color: Color(0xFF40E0D0), width: 2)),
          contentPadding: EdgeInsets.symmetric(horizontal: isWeb ? 20 : 16, vertical: isWeb ? 18 : 16),
        ),
        onTap: () => GlobalAudioService.playClickSound(),
      ),
    );
  }

  Widget _dropdown(String label, String value, List<String> items, ValueChanged<String> onChanged,
      {String Function(String)? itemLabelBuilder}) {
    return Padding(
      padding: EdgeInsets.only(bottom: isWeb ? 18 : 16),
      child: DropdownButtonFormField<String>(
        initialValue: value,
        style: GoogleFonts.poppins(fontSize: isWeb ? 17 : 16, color: Colors.black87),
        decoration: InputDecoration(
          labelText: label, labelStyle: TextStyle(fontSize: isWeb ? 16 : 15),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide(color: Colors.grey[300]!)),
          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: const BorderSide(color: Color(0xFF40E0D0), width: 2)),
          contentPadding: EdgeInsets.symmetric(horizontal: isWeb ? 20 : 16, vertical: isWeb ? 18 : 16),
        ),
        items: items.map((e) => DropdownMenuItem(value: e, child: Text(itemLabelBuilder != null ? itemLabelBuilder(e) : e))).toList(),
        onChanged: (v) { if (v != null) { GlobalAudioService.playClickSound(); onChanged(v); } },
      ),
    );
  }
}