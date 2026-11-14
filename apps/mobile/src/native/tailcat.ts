import { ClientCapabilities } from "@t3tools/client-runtime/platform";
import {
  ConnectionBlockedError,
  ConnectionTransientError,
} from "@t3tools/client-runtime/connection";
import * as Effect from "effect/Effect";
import { requireOptionalNativeModule } from "expo";

interface NativeModule {
  /** Resolves the loopback port that reaches `port` on the tailcat server. */
  forward(address: string, port: number): Promise<number>;
}

const native = requireOptionalNativeModule<NativeModule>("T3Tailcat");

export const tailcatGateway = ClientCapabilities.TailcatGateway.of({
  forward: Effect.fn("ClientCapabilities.TailcatGateway.forward")(function* (endpoint) {
    // A dev client built before this module shipped has no tailcat library.
    if (native === null) {
      return yield* new ConnectionBlockedError({
        reason: "unsupported",
        detail: "This build of the app cannot open tailcat connections. Update the app.",
      });
    }
    const localPort = yield* Effect.tryPromise({
      try: () => native.forward(endpoint.address, endpoint.port),
      catch: (cause) =>
        new ConnectionTransientError({
          reason: "remote-unavailable",
          detail: `Could not reach the machine over tailcat: ${cause instanceof Error ? cause.message : String(cause)}`,
        }),
    });
    const host = `127.0.0.1:${String(localPort)}`;
    return { httpBaseUrl: `http://${host}/`, wsBaseUrl: `ws://${host}/` };
  }),
});
