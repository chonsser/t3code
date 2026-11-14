Pod::Spec.new do |s|
  s.name = 'T3Tailcat'
  s.version = '1.0.0'
  s.summary = 'Tailcat tunnels for T3 Code mobile.'
  s.description = 'Links the tailcat client so the app can reach a T3 Code server through a tailcat tunnel, exposed to the app as a loopback port.'
  s.author = 'T3 Tools'
  s.homepage = 'https://t3tools.com'
  s.platform = :ios, '16.1'
  s.source = { :path => '.' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = 'ios/*.{h,swift}'
  s.vendored_frameworks = 'Vendor/T3TailcatCore.xcframework'
  # The Go archive has no x86_64 simulator slice.
  s.pod_target_xcconfig = { 'EXCLUDED_ARCHS[sdk=iphonesimulator*]' => 'x86_64' }
  s.user_target_xcconfig = { 'EXCLUDED_ARCHS[sdk=iphonesimulator*]' => 'x86_64' }
  s.frameworks = 'CoreFoundation', 'Security'
  s.libraries = 'resolv'
  s.swift_version = '5.9'
end
