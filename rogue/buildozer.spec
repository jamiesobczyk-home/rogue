[app]
# Application metadata
title = Rogue
package.name = rogue
package.domain = org.rogue

source.dir = .
source.include_exts = py,png,jpg,kv,atlas,ttf

version = 1.0.0

# Kivy as the framework
requirements = python3,kivy

# Orientation – portrait on phone; landscape on tablet
orientation = portrait

# Android specific
android.permissions = INTERNET
android.api = 33
android.minapi = 26
android.ndk = 25b
android.archs = arm64-v8a, armeabi-v7a

# iOS specific
ios.kivy_ios_url = https://github.com/kivy/kivy-ios
ios.kivy_ios_branch = master

[buildozer]
log_level = 2
warn_on_root = 1
