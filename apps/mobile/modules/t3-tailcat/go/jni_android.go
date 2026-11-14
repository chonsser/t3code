package main

/*
#include <jni.h>
#include <stdlib.h>

static const char *t3tc_chars(JNIEnv *env, jstring value) {
	return (*env)->GetStringUTFChars(env, value, NULL);
}

static void t3tc_release(JNIEnv *env, jstring value, const char *chars) {
	(*env)->ReleaseStringUTFChars(env, value, chars);
}

static void t3tc_throw(JNIEnv *env, const char *message) {
	jclass type = (*env)->FindClass(env, "java/io/IOException");
	if (type != NULL) {
		(*env)->ThrowNew(env, type, message);
	}
}
*/
import "C"

import "unsafe"

func javaString(env *C.JNIEnv, value C.jstring) string {
	chars := C.t3tc_chars(env, value)
	defer C.t3tc_release(env, value, chars)
	return C.GoString(chars)
}

//export Java_expo_modules_t3tailcat_TailcatForwarder_forward
func Java_expo_modules_t3tailcat_TailcatForwarder_forward(env *C.JNIEnv, _ C.jobject, address C.jstring, remotePort C.jint) C.jint {
	port, failure := ensureForward(javaString(env, address), uint16(remotePort))
	if failure != nil {
		message := C.CString(failure.Error())
		defer C.free(unsafe.Pointer(message))
		C.t3tc_throw(env, message)
		return 0
	}
	return C.jint(port)
}
