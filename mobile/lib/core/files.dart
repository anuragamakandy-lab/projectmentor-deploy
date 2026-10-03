import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';
import 'package:url_launcher/url_launcher.dart';

/// Save bytes into the app's documents folder and open them with the phone's viewer
/// (PDF reader, Word, PowerPoint, Excel). Returns a short message for the user.
Future<String> saveAndOpen(Uint8List bytes, String fileName) async {
  if (kIsWeb) return 'Downloads open on the phone app. On the web, use the website instead.';
  final dir = await getApplicationDocumentsDirectory();
  final safe = fileName.replaceAll(RegExp(r'[^\w.\- ]'), '_');
  final file = File('${dir.path}${Platform.pathSeparator}$safe');
  await file.writeAsBytes(bytes, flush: true);
  final result = await OpenFilex.open(file.path);
  return result.type == ResultType.done ? 'Saved $safe' : 'Saved $safe. Install an app that can open this file type to view it.';
}


Future<bool> openLink(String url) => launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
