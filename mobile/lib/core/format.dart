import 'package:intl/intl.dart';

DateTime? parseDate(dynamic v) => v is String ? DateTime.tryParse(v)?.toLocal() : null;

/// "2026-10-11" (DateOnly from the API) as a local date with no time-zone shift.
DateTime? parseDay(dynamic v) {
  if (v is! String || v.length < 10) return null;
  final p = v.substring(0, 10).split('-').map(int.tryParse).toList();
  if (p.contains(null)) return null;
  return DateTime(p[0]!, p[1]!, p[2]!);
}

String dayKey(DateTime d) => DateFormat('yyyy-MM-dd').format(d);
String shortDate(DateTime? d) => d == null ? '' : DateFormat('d MMM').format(d);
String longDate(DateTime? d) => d == null ? '' : DateFormat('EEEE, d MMMM yyyy').format(d);
String mediumDate(DateTime? d) => d == null ? '' : DateFormat('d MMM yyyy').format(d);
String timeOfDay(DateTime? d) => d == null ? '' : DateFormat('HH:mm').format(d);

DateTime today() { final n = DateTime.now(); return DateTime(n.year, n.month, n.day); }
int daysUntil(DateTime d) => d.difference(today()).inDays;

String countdown(int days, {bool done = false}) {
  if (done) return 'Completed';
  if (days < -1) return '${-days} days overdue';
  if (days == -1) return '1 day overdue';
  if (days == 0) return 'Due today';
  if (days == 1) return 'Due tomorrow';
  if (days < 14) return 'In $days days';
  return 'In ${(days / 7).round()} weeks';
}

String timeAgo(DateTime? d) {
  if (d == null) return '';
  final s = DateTime.now().difference(d).inSeconds;
  if (s < 45) return 'just now';
  if (s < 3600) return '${(s / 60).round()} min ago';
  if (s < 86400) return '${(s / 3600).round()} h ago';
  if (s < 7 * 86400) return '${(s / 86400).round()} d ago';
  return mediumDate(d);
}

String initials(String? name) {
  final parts = (name ?? '?').trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  if (parts.length == 1) return parts.first.substring(0, parts.first.length.clamp(1, 2)).toUpperCase();
  return (parts.first[0] + parts.last[0]).toUpperCase();
}

String greeting() {
  final h = DateTime.now().hour;
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/// Monday of the week, matching the API's sprint WeekStart.
DateTime mondayOf(DateTime d) => DateTime(d.year, d.month, d.day).subtract(Duration(days: d.weekday - 1));

String weekLabel(String? week, String current) {
  if (week == null) return 'No week';
  final w = parseDay(week)!, c = parseDay(current)!;
  final diff = w.difference(c).inDays ~/ 7;
  if (diff == 0) return 'This week';
  if (diff == 1) return 'Next week';
  if (diff == -1) return 'Last week';
  return 'Week of ${shortDate(w)}';
}

String statusLabel(String s) => switch (s) {
      'NotStarted' => 'Not started',
      'InProgress' => 'In progress',
      'Todo' => 'To do',
      _ => s,
    };

String fileSize(num bytes) => bytes > 1024 * 1024 ? '${(bytes / 1024 / 1024).toStringAsFixed(1)} MB' : '${(bytes / 1024).ceil()} KB';
