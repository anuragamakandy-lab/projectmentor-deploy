import 'package:flutter_test/flutter_test.dart';

import 'package:projectmentor_mobile/core/format.dart';

void main() {
  test('initials uses the first letters of the first and last names', () {
    expect(initials('Nimal Perera Silva'), 'NS');
    expect(initials('ann'), 'AN');
  });

  test('mondayOf returns the Monday of the same week', () {
    final m = mondayOf(DateTime(2026, 10, 2)); // Friday
    expect(m.weekday, DateTime.monday);
    expect(m.day, 28);
  });
}
