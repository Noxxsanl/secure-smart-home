// Kiểm quy tắc phụ thuộc của mobile/lib (chỉ dùng dart:io, không cài thêm package).
// Chạy trong mobile/: dart run tool/check_architecture.dart
//
// Quy tắc (giải thích ở mobile/README.md §3):
//   A1  Tầng: core/ → core/ · mock/ → core/, mock/, barrel module · modules/ → core/, mock/ (chỉ từ data/ và
//       application/), module khác qua barrel · app/ → core/, app/, barrel + <m>_module.dart. Chỉ main.dart
//       và app/ được import app/.
//   A2  Module khác chỉ qua barrel modules/<m>/<m>.dart; modules/<m>/<m>_module.dart (trang + route) chỉ app/
//       import. Trong module dùng đường dẫn tới file, không đi vòng qua barrel/<m>_module.dart của chính nó.
//   A3  Trong module: domain/ → domain/ (+ core/utils/) · data/ → domain/, data/ · application/ → domain/,
//       data/, application/ · ui/ → domain/, application/, ui/ · features/<f> → domain/, application/, ui/,
//       chính features/<f>. Barrel chỉ export domain/, application/, ui/ và data/*_mapper.dart;
//       <m>_module.dart chỉ thêm features/.
//   A4  features/<a> không import features/<b>, kể cả cùng module — mở trang của feature khác bằng named
//       route (core/navigation/app_routes.dart), app/router.dart ghép.
//   A5  Trong lib/ import file của app bằng đường dẫn tương đối, không dùng package:smart_home_mobile/.
//   A6  Không package MQTT: mobile chỉ nhận realtime qua WebSocket backend (bất biến 7).
import 'dart:io';

const _package = 'smart_home_mobile';
const _layers = {'domain', 'data', 'application', 'ui', 'features'};
const _allowedInModule = <String, Set<String>>{
  'domain': {'domain'},
  'data': {'domain', 'data'},
  'application': {'domain', 'data', 'application'},
  'ui': {'domain', 'application', 'ui'},
  'features': {'domain', 'application', 'ui', 'features'},
  'barrel': {'domain', 'data', 'application', 'ui'},
  'entry': {'domain', 'data', 'application', 'ui', 'features'},
};

/// Vị trí của một file trong lib/.
class Place {
  Place(this.path) {
    final parts = path.split('/');
    area = parts.length == 1 ? (path == 'main.dart' ? 'main' : 'other') : parts[0];
    if (area != 'modules' || parts.length < 3) return;
    module = parts[1];
    if (parts.length == 3) {
      layer = parts[2] == '$module.dart'
          ? 'barrel'
          : parts[2] == '${module}_module.dart'
          ? 'entry'
          : 'other';
    } else {
      layer = _layers.contains(parts[2]) ? parts[2] : 'other';
      if (layer == 'features' && parts.length > 4) feature = parts[3];
    }
  }

  final String path;
  late final String area;
  String? module;
  String? layer;
  String? feature;
}

class Violation {
  Violation(this.code, this.file, this.line, this.message);

  final String code;
  final String file;
  final int line;
  final String message;
}

final _directive = RegExp(r'''^\s*(import|export)\s+['"]([^'"]+)['"]''');

String _normalize(String path) {
  final out = <String>[];
  for (final part in path.split('/')) {
    if (part == '..') {
      if (out.isNotEmpty) out.removeLast();
    } else if (part != '.' && part.isNotEmpty) {
      out.add(part);
    }
  }
  return out.join('/');
}

void main() {
  final lib = Directory('lib');
  if (!lib.existsSync()) {
    stderr.writeln('Chạy trong thư mục mobile/: dart run tool/check_architecture.dart');
    exit(2);
  }
  final files =
      lib
          .listSync(recursive: true)
          .whereType<File>()
          .map((f) => f.path.replaceAll(r'\', '/').substring('lib/'.length))
          .where((p) => p.endsWith('.dart'))
          .toList()
        ..sort();
  final violations = <Violation>[];

  for (final rel in files) {
    final from = Place(rel);
    final lines = File('lib/$rel').readAsLinesSync();
    for (var i = 0; i < lines.length; i++) {
      final match = _directive.firstMatch(lines[i]);
      if (match == null) continue;
      final kind = match.group(1)!;
      final uri = match.group(2)!;
      void report(String code, String message) =>
          violations.add(Violation(code, 'lib/$rel', i + 1, '$kind \'$uri\': $message'));

      String target;
      if (uri.startsWith('package:$_package/')) {
        report('A5', 'dùng đường dẫn tương đối trong lib/');
        target = uri.substring('package:$_package/'.length);
      } else if (uri.startsWith('package:')) {
        if (uri.split('/').first.contains('mqtt')) {
          report('A6', 'mobile không kết nối MQTT — realtime đi qua WebSocket backend');
        }
        continue;
      } else if (uri.startsWith('dart:')) {
        continue;
      } else {
        final dir = rel.contains('/') ? rel.substring(0, rel.lastIndexOf('/')) : '';
        target = _normalize(dir.isEmpty ? uri : '$dir/$uri');
      }
      final to = Place(target);
      if (!files.contains(target)) {
        report('A1', 'không tìm thấy lib/$target');
        continue;
      }
      _check(from, to, report);
    }
  }

  // Ô trống ở gốc module (không phải barrel/<m>_module.dart, không thuộc tầng nào).
  for (final rel in files) {
    final place = Place(rel);
    if (place.area == 'modules' && place.layer == 'other') {
      violations.add(
        Violation('A3', 'lib/$rel', 1, 'file nằm ngoài domain/ data/ application/ ui/ features/'),
      );
    }
  }

  if (violations.isEmpty) {
    stdout.writeln('check_architecture: OK — ${files.length} file, 0 vi phạm.');
    return;
  }
  for (final v in violations) {
    stdout.writeln('${v.code}  ${v.file}:${v.line}  ${v.message}');
  }
  stdout.writeln('\ncheck_architecture: ${violations.length} vi phạm (quy tắc: mobile/README.md §3).');
  exit(1);
}

void _check(Place from, Place to, void Function(String, String) report) {
  // A1 — ai được import app/ và main.dart.
  if (to.area == 'main') return report('A1', 'không ai được import main.dart');
  if (to.area == 'app' && from.area != 'app' && from.area != 'main') {
    return report('A1', 'chỉ main.dart và app/ được import composition root');
  }

  switch (from.area) {
    case 'core':
      if (to.area != 'core') report('A1', 'core/ chỉ dùng core/');
    case 'mock':
      if (to.area == 'modules' && to.layer != 'barrel') {
        report('A2', 'mock/ dùng module qua barrel modules/${to.module}/${to.module}.dart');
      }
    case 'app' || 'main':
      if (to.area == 'mock') report('A1', 'app/ không chọn nguồn dữ liệu — để application/ của module');
      if (to.area == 'modules' && to.layer != 'barrel' && to.layer != 'entry') {
        report('A2', 'app/ dùng module qua ${to.module}.dart hoặc ${to.module}_module.dart');
      }
    case 'modules':
      _checkModule(from, to, report);
  }
}

void _checkModule(Place from, Place to, void Function(String, String) report) {
  final layer = from.layer!;
  if (to.area == 'mock' && layer != 'data' && layer != 'application') {
    return report('A1', 'chỉ data/ và application/ được dùng mock/');
  }
  if (to.area == 'core') {
    if (layer == 'domain' && !to.path.startsWith('core/utils/')) {
      report('A3', 'domain/ chỉ dùng core/utils/');
    }
    return;
  }
  if (to.area != 'modules') return;

  if (to.module != from.module) {
    if (to.layer == 'entry') {
      return report('A2', '${to.module}_module.dart chỉ dành cho app/ — mở trang bằng named route');
    }
    if (to.layer != 'barrel') {
      return report('A2', 'module khác chỉ qua barrel modules/${to.module}/${to.module}.dart');
    }
    return;
  }

  // Cùng module.
  if (to.layer == 'barrel' || to.layer == 'entry') {
    return report('A2', 'trong module import thẳng file, không qua ${to.path.split('/').last}');
  }
  final allowed = _allowedInModule[layer] ?? const <String>{};
  if (!allowed.contains(to.layer)) {
    return report('A3', '$layer/ không được dùng ${to.layer}/');
  }
  if (layer == 'barrel' && to.layer == 'data' && !to.path.endsWith('_mapper.dart')) {
    return report('A3', 'barrel chỉ công khai mapper của data/, không công khai repository');
  }
  if (layer == 'features' && to.layer == 'features' && to.feature != from.feature) {
    report('A4', 'feature ${from.feature} không import feature ${to.feature} — dùng named route');
  }
}
