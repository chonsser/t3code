import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";

import { serveTailcat } from "./tailcat.ts";

const encoder = new TextEncoder();

function tailcatSpawner(
  calls: Array<ReadonlyArray<string>>,
  run: (args: ReadonlyArray<string>) => { readonly stdout?: string; readonly code?: number },
) {
  return ChildProcessSpawner.make((command) => {
    const child = command as unknown as {
      readonly command: string;
      readonly args: ReadonlyArray<string>;
    };
    calls.push([child.command, ...child.args]);
    const result = run(child.args);
    return Effect.succeed(
      ChildProcessSpawner.makeHandle({
        pid: ChildProcessSpawner.ProcessId(1),
        exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(result.code ?? 0)),
        isRunning: Effect.succeed(false),
        kill: () => Effect.void,
        unref: Effect.succeed(Effect.void),
        stdin: Sink.drain,
        stdout: Stream.make(encoder.encode(result.stdout ?? "")),
        stderr: Stream.empty,
        all: Stream.empty,
        getInputFd: () => Sink.drain,
        getOutputFd: () => Stream.empty,
      }),
    );
  });
}

it.effect("generates the key once and returns the address tailcat serve reports", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = yield* fs.makeTempDirectoryScoped({ prefix: "t3-tailcat-" });
    const keyPath = path.join(dir, "tailcat.private.json");
    const calls: Array<ReadonlyArray<string>> = [];
    const spawner = tailcatSpawner(calls, (args) => {
      if (args[0] === "genkey") {
        return {};
      }
      return { stdout: '# not json\n{"listenAddr":"tcExampleAddress"}\n' };
    });
    const serve = serveTailcat({ port: 3773, keyPath }).pipe(
      Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
    );

    assert.equal(yield* serve, "tcExampleAddress");
    // A saved key keeps the address, and with it every paired client's route.
    yield* fs.writeFileString(keyPath, "{}");
    assert.equal(yield* serve, "tcExampleAddress");

    const serveArgs = ["tailcat", `--key=${keyPath}`, "--json", "serve", "3773"];
    assert.deepEqual(calls, [["tailcat", "genkey", `--key=${keyPath}`], serveArgs, serveArgs]);
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("fails when tailcat cannot generate the key", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = yield* fs.makeTempDirectoryScoped({ prefix: "t3-tailcat-" });
    const error = yield* serveTailcat({
      port: 3773,
      keyPath: path.join(dir, "tailcat.private.json"),
    }).pipe(
      Effect.provideService(
        ChildProcessSpawner.ChildProcessSpawner,
        tailcatSpawner([], (args) => (args[0] === "genkey" ? { code: 1 } : {})),
      ),
      Effect.flip,
    );

    assert.equal(error._tag, "TailcatUnavailableError");
    assert.equal(error.step, "genkey");
  }).pipe(Effect.provide(NodeServices.layer)),
);
