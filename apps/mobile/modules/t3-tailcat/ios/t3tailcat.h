#ifndef T3TAILCAT_H
#define T3TAILCAT_H

#include <stdint.h>

/// Returns the loopback port that reaches `remote_port` on the tailcat server, or 0 with `*error`
/// set to a message to release with `t3tc_free`.
int32_t t3tc_forward(const char *address, uint16_t remote_port, char **error);
void t3tc_free(void *allocation);

#endif
