package expo.modules.t3tailcat

import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.IOException

/** The Go tailcat client in `libt3tailcat.so`; see `modules/t3-tailcat/go`. */
internal object TailcatForwarder {
  init {
    System.loadLibrary("t3tailcat")
  }

  @Throws(IOException::class)
  external fun forward(address: String, remotePort: Int): Int
}

class T3TailcatModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("T3Tailcat")

    // Blocks while the tunnel comes up; async functions run off the main thread.
    AsyncFunction("forward") { address: String, port: Int ->
      try {
        TailcatForwarder.forward(address, port)
      } catch (cause: IOException) {
        throw CodedException("ERR_TAILCAT", cause.message ?: "The tailcat tunnel failed.", cause)
      } catch (cause: UnsatisfiedLinkError) {
        throw CodedException("ERR_TAILCAT", "Tailcat is not available on this device.", cause)
      }
    }
  }
}
