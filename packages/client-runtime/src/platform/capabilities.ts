import {
  type AuthClientPresentationMetadata,
  type DesktopSshEnvironmentBootstrap,
  type DesktopSshEnvironmentTarget,
  EnvironmentId,
} from "@t3tools/contracts";
import type { TailcatEndpoint } from "@t3tools/shared/remote";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import type * as Option from "effect/Option";

import { ConnectionBlockedError, type ConnectionAttemptError } from "../connection/model.ts";

export interface PreparedSshEnvironment {
  readonly bootstrap: DesktopSshEnvironmentBootstrap;
  readonly bearerToken: string;
}

export interface ProvisionedSshEnvironment extends PreparedSshEnvironment {
  readonly environmentId: EnvironmentId;
  readonly label: string;
}

/** Stable for one signed-in session, including same-account token refreshes. */
export interface CloudSessionIdentity {
  readonly accountId: string;
}

export class CloudSession extends Context.Service<
  CloudSession,
  {
    readonly identity: Effect.Effect<Option.Option<CloudSessionIdentity>>;
    readonly clerkToken: Effect.Effect<string, ConnectionAttemptError>;
  }
>()("@t3tools/client-runtime/platform/capabilities/CloudSession") {}

export class RelayDeviceIdentity extends Context.Service<
  RelayDeviceIdentity,
  {
    readonly deviceId: Effect.Effect<Option.Option<string>, ConnectionAttemptError>;
  }
>()("@t3tools/client-runtime/platform/capabilities/RelayDeviceIdentity") {}

/**
 * A random id this client keeps across launches. Environments it connects to
 * record its hash, so two environments opened from one device share an owner
 * in analytics even when nobody is signed in.
 */
export class AnalyticsDevice extends Context.Reference<{
  readonly id: Effect.Effect<Option.Option<string>>;
}>("@t3tools/client-runtime/platform/capabilities/AnalyticsDevice", {
  defaultValue: () => ({ id: Effect.succeedNone }),
}) {}

export class ClientPresentation extends Context.Service<
  ClientPresentation,
  {
    readonly metadata: AuthClientPresentationMetadata;
  }
>()("@t3tools/client-runtime/platform/capabilities/ClientPresentation") {}

export class PrimaryEnvironmentAuth extends Context.Service<
  PrimaryEnvironmentAuth,
  {
    readonly bearerToken: Effect.Effect<Option.Option<string>, ConnectionAttemptError>;
  }
>()("@t3tools/client-runtime/platform/capabilities/PrimaryEnvironmentAuth") {}

/**
 * Opens tailcat tunnels. `forward` returns the loopback URLs that reach the
 * endpoint, reusing a live tunnel and replacing a dead one, so the port can
 * differ between calls. Only clients that link the tailcat library provide it.
 */
export class TailcatGateway extends Context.Reference<{
  readonly forward: (
    endpoint: TailcatEndpoint,
  ) => Effect.Effect<
    { readonly httpBaseUrl: string; readonly wsBaseUrl: string },
    ConnectionAttemptError
  >;
}>("@t3tools/client-runtime/platform/capabilities/TailcatGateway", {
  defaultValue: () => ({
    forward: () =>
      Effect.fail(
        new ConnectionBlockedError({
          reason: "unsupported",
          detail: "Tailcat connections are only available in the mobile app.",
        }),
      ),
  }),
}) {}

export class SshEnvironmentGateway extends Context.Service<
  SshEnvironmentGateway,
  {
    /**
     * With `expectedEnvironmentId`, a server that is a different machine fails
     * before its one-time pairing credential is spent.
     */
    readonly provision: (
      target: DesktopSshEnvironmentTarget,
      expectedEnvironmentId?: EnvironmentId,
    ) => Effect.Effect<ProvisionedSshEnvironment, ConnectionAttemptError>;
    /**
     * Starts or reuses the remote server for a saved connection. Returns
     * `bearerToken`, the token this client saved from an earlier pairing, while
     * the host still accepts it with the standard scopes, and pairs again only
     * when it does not, so a reconnect adds no session on the host.
     */
    readonly prepare: (input: {
      readonly connectionId: string;
      readonly expectedEnvironmentId: EnvironmentId;
      readonly target: DesktopSshEnvironmentTarget;
      readonly bearerToken?: string;
    }) => Effect.Effect<PreparedSshEnvironment, ConnectionAttemptError>;
    readonly disconnect: (
      target: DesktopSshEnvironmentTarget,
    ) => Effect.Effect<void, ConnectionAttemptError>;
  }
>()("@t3tools/client-runtime/platform/capabilities/SshEnvironmentGateway") {}
