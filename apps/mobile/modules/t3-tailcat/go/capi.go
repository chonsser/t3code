package main

/*
#include <stdint.h>
#include <stdlib.h>
*/
import "C"

import "unsafe"

func main() {}

// t3tc_forward returns the loopback port, or 0 with *err set to a message the
// caller frees with t3tc_free.
//
//export t3tc_forward
func t3tc_forward(address *C.char, remotePort C.uint16_t, err **C.char) C.int32_t {
	port, failure := ensureForward(C.GoString(address), uint16(remotePort))
	if failure != nil {
		if err != nil {
			*err = C.CString(failure.Error())
		}
		return 0
	}
	return C.int32_t(port)
}

//export t3tc_free
func t3tc_free(ptr unsafe.Pointer) {
	C.free(ptr)
}
