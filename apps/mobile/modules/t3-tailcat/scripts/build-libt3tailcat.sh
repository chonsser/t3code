#!/usr/bin/env bash
# Rebuilds the committed tailcat client binaries from ../go: the iOS
# xcframework and the Android JNI libraries. Needs Go (see go/go.mod), Xcode,
# and an Android NDK in ANDROID_NDK_HOME.
set -euo pipefail

MODULE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
GO_DIR="$MODULE_DIR/go"
BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "$BUILD_DIR"' EXIT

IOS_MIN=16.1
ANDROID_API=24
PLATFORMS="${1:-all}"

cd "$GO_DIR"
TAILCAT_DIR="$(go list -m -f '{{.Dir}}' github.com/tailscale/tailcat)"
TAGS="$(cat "$TAILCAT_DIR/build-tags.txt")"
VERSION="$(go list -m -f '{{.Version}}' github.com/tailscale/tailcat)"

build() {
  go build -trimpath -tags "$TAGS" -ldflags "-s -w" "$@" .
}

build_ios_slice() {
  local sdk="$1" target="$2" out="$3"
  local sdk_path clang
  sdk_path="$(xcrun --sdk "$sdk" --show-sdk-path)"
  clang="$(xcrun --sdk "$sdk" --find clang)"
  mkdir -p "$out"
  # Not libt3tailcat.a: the pod's own libT3Tailcat.a would shadow it on a case-insensitive disk.
  GOOS=ios GOARCH=arm64 CGO_ENABLED=1 CC="$clang" \
    CGO_CFLAGS="-isysroot $sdk_path -target $target" \
    CGO_LDFLAGS="-isysroot $sdk_path -target $target" \
    build -buildmode=c-archive -o "$out/libt3tailcatcore.a"
}

if [[ "$PLATFORMS" == "all" || "$PLATFORMS" == "ios" ]]; then
  build_ios_slice iphoneos "arm64-apple-ios$IOS_MIN" "$BUILD_DIR/ios"
  build_ios_slice iphonesimulator "arm64-apple-ios$IOS_MIN-simulator" "$BUILD_DIR/ios-simulator"
  rm -rf "$MODULE_DIR/Vendor/T3TailcatCore.xcframework"
  mkdir -p "$MODULE_DIR/Vendor"
  xcodebuild -create-xcframework \
    -library "$BUILD_DIR/ios/libt3tailcatcore.a" \
    -library "$BUILD_DIR/ios-simulator/libt3tailcatcore.a" \
    -output "$MODULE_DIR/Vendor/T3TailcatCore.xcframework"
fi

if [[ "$PLATFORMS" == "all" || "$PLATFORMS" == "android" ]]; then
  : "${ANDROID_NDK_HOME:?Set ANDROID_NDK_HOME to an Android NDK}"
  TOOLCHAIN="$(echo "$ANDROID_NDK_HOME"/toolchains/llvm/prebuilt/*/bin)"
  build_android() {
    local goarch="$1" triple="$2" abi="$3"
    local out="$MODULE_DIR/android/src/main/jniLibs/$abi"
    mkdir -p "$out"
    GOOS=android GOARCH="$goarch" GOARM=7 CGO_ENABLED=1 CC="$TOOLCHAIN/$triple$ANDROID_API-clang" \
      build -buildmode=c-shared -o "$out/libt3tailcat.so"
    rm -f "$out/libt3tailcat.h"
  }
  build_android arm64 aarch64-linux-android arm64-v8a
  build_android arm armv7a-linux-androideabi armeabi-v7a
  build_android amd64 x86_64-linux-android x86_64
fi

echo "$VERSION" >"$MODULE_DIR/Vendor/TAILCAT_VERSION"
