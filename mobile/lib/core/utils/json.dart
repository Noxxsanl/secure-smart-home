/// Lenient readers for API payloads (contract §0: snake_case fields,
/// numeric ids, ISO-8601 UTC timestamps, real booleans).
library;

typedef Json = Map<String, dynamic>;

/// Casts a decoded JSON value to an object map.
Json asJson(Object? value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) {
    return value.map((key, item) => MapEntry(key.toString(), item));
  }
  throw FormatException('Expected a JSON object, got ${value.runtimeType}');
}

/// Casts a decoded JSON value to a list of object maps.
List<Json> asJsonList(Object? value) {
  if (value is List) return value.map(asJson).toList();
  throw FormatException('Expected a JSON array, got ${value.runtimeType}');
}

final _zoneSuffix = RegExp(r'(Z|[+-]\d{2}:?\d{2})$');
final _dateTimePrefix = RegExp(r'^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}');

/// Parses an API timestamp. Values without a zone designator are UTC
/// (the backend's PostgreSQL session runs in UTC).
DateTime? parseApiDate(Object? value) {
  if (value is! String) return null;
  var text = value.trim();
  if (text.isEmpty) return null;
  if (!_zoneSuffix.hasMatch(text) && _dateTimePrefix.hasMatch(text)) {
    text = '${text.replaceFirst(' ', 'T')}Z';
  }
  return DateTime.tryParse(text);
}

extension JsonReader on Map<String, dynamic> {
  int readInt(String key) {
    final value = readIntOrNull(key);
    if (value == null) throw FormatException('Missing integer field "$key"');
    return value;
  }

  int? readIntOrNull(String key) {
    final value = this[key];
    if (value is int) return value;
    if (value is num) return value.toInt();
    if (value is String) {
      return int.tryParse(value) ?? double.tryParse(value)?.toInt();
    }
    return null;
  }

  /// Accepts numbers and numeric strings (pg returns NUMERIC/DECIMAL as string).
  double? readDoubleOrNull(String key) {
    final value = this[key];
    if (value is num) return value.toDouble();
    if (value is String) return double.tryParse(value);
    return null;
  }

  String readString(String key, {String fallback = ''}) {
    final value = this[key];
    if (value == null) return fallback;
    return value is String ? value : value.toString();
  }

  String? readStringOrNull(String key) {
    final value = this[key];
    if (value == null) return null;
    return value is String ? value : value.toString();
  }

  bool readBool(String key, {bool fallback = false}) =>
      readBoolOrNull(key) ?? fallback;

  /// Accepts `true/false`, `1/0` and their string forms (TINYINT columns).
  bool? readBoolOrNull(String key) {
    final value = this[key];
    if (value is bool) return value;
    if (value is num) return value != 0;
    if (value is String) {
      final normalized = value.trim().toLowerCase();
      if (normalized == 'true' || normalized == '1') return true;
      if (normalized == 'false' || normalized == '0') return false;
    }
    return null;
  }

  DateTime? readDateOrNull(String key) => parseApiDate(this[key]);

  Json? readObjectOrNull(String key) {
    final value = this[key];
    return value is Map ? asJson(value) : null;
  }

  Json readObject(String key) {
    final value = readObjectOrNull(key);
    if (value == null) throw FormatException('Missing object field "$key"');
    return value;
  }

  List<Json> readObjectList(String key) {
    final value = this[key];
    if (value is List) return value.whereType<Map>().map(asJson).toList();
    return const [];
  }

  /// Accepts a JSON array of numbers or a CSV string ("1,2,3").
  List<int> readIntList(String key) {
    final value = this[key];
    if (value is List) {
      return [
        for (final item in value)
          if (item is num)
            item.toInt()
          else if (item is String && int.tryParse(item.trim()) != null)
            int.parse(item.trim()),
      ];
    }
    if (value is String && value.trim().isNotEmpty) {
      return [
        for (final part in value.split(','))
          if (int.tryParse(part.trim()) != null) int.parse(part.trim()),
      ];
    }
    return const [];
  }
}
