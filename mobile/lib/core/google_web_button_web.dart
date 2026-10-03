import 'package:flutter/widgets.dart';
import 'package:google_sign_in_web/web_only.dart' as web;

/// In a browser Google only gives an ID token through its own button.
Widget googleWebButton() => web.renderButton();
