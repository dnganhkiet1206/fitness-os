require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'AscndNative'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = { :type => 'MIT' }
  s.author         = { 'ASCND' => 'https://github.com/dnganhkiet1206/fitness-os' }
  s.homepage       = 'https://github.com/dnganhkiet1206/fitness-os'
  # Must match the app's IPHONEOS_DEPLOYMENT_TARGET (Expo SDK 57 default: 16.4).
  # The Swift code itself guards ActivityKit with #available(iOS 16.1, *).
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { :git => 'https://github.com/dnganhkiet1206/fitness-os.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # App-target sources ONLY. Widgets/ is excluded on purpose: the widget
  # extension target compiles those files itself (via
  # plugins/with-ascnd-widgets.js), and ASCNDWidgets.swift's @main entry point
  # must never be linked into the app target.
  s.source_files = ['AscndNativeModule.swift', 'Shared/**/*.swift']
  s.exclude_files = ['Widgets/**/*']

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
