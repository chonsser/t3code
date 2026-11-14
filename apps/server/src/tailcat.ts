import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";

const TAILCAT_KILL_GRACE = Duration.seconds(2);
// Startup picks the nearest relay over the network before it prints the address.
const TAILCAT_START_TIMEOUT = Duration.seconds(30);

export class TailcatUnavailableError extends Schema.TaggedError<TailcatUnavailableError>()(
  "TailcatUnavailableError",
  {
    step: Schema.Literals(["genkey", "serve"]),
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    return `Could not run \`tailcat ${this.step}\`. Is tailcat installed? See https://github.com/tailscale/tailcat.`;
  }
}

const decodeListenAddress = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ listenAddr: Schema.String })),
);

/**
 * Runs `tailcat serve` for the server on `port` until the scope closes, and
 * returns the tailcat address clients dial. The key is saved, so the address
 * stays the same across restarts and a paired client keeps its route. Nothing
 * here logs the address: whoever holds it can reach the port.
 */
export const serveTailcat = Effect.fn("tailcat.serve")(function* (input: {
  readonly port: number;
  readonly keyPath: string;
}) {
  const fs = yield* FileSystem.FileSystem;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const executable = (yield* HostProcess.Platform) === "win32" ? "tailcat.exe" : "tailcat";
  const spawn = (step: "genkey" | "serve", args: ReadonlyArray<string>) =>
    spawner
      .spawn(ChildProcess.make(executable, [...args], { forceKillAfter: TAILCAT_KILL_GRACE }))
      .pipe(
        Effect.mapError((cause) => new TailcatUnavailableError({ step, cause })),
        // A file on PATH where a directory belongs makes node throw instead of failing.
        Effect.catchDefect((cause) => Effect.fail(new TailcatUnavailableError({ step, cause }))),
      );

  const keyExists = yield* fs.exists(input.keyPath).pipe(Effect.orElseSucceed(() => false));
  if (!keyExists) {
    const exitCode = yield* spawn("genkey", ["genkey", `--key=${input.keyPath}`]).pipe(
      Effect.flatMap((child) => child.exitCode),
      Effect.scoped,
      Effect.mapError((cause) => new TailcatUnavailableError({ step: "genkey", cause })),
    );
    if (Number(exitCode) !== 0) {
      return yield* new TailcatUnavailableError({ step: "genkey" });
    }
  }

  const child = yield* spawn("serve", [
    `--key=${input.keyPath}`,
    "--json",
    "serve",
    String(input.port),
  ]);
  yield* child.stderr.pipe(Stream.runDrain, Effect.ignore, Effect.forkScoped);
  const address = yield* child.stdout.pipe(
    Stream.decodeText(),
    Stream.splitLines,
    Stream.map((line) => decodeListenAddress(line)),
    Stream.filter(Option.isSome),
    Stream.runHead,
    Effect.timeout(TAILCAT_START_TIMEOUT),
    Effect.mapError((cause) => new TailcatUnavailableError({ step: "serve", cause })),
  );
  if (Option.isNone(address)) {
    return yield* new TailcatUnavailableError({ step: "serve" });
  }
  return address.value.value.listenAddr;
});
