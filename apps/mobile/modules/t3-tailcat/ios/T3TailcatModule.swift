import ExpoModulesCore
import Foundation

final class TailcatForwardException: GenericException<String> {
  override var reason: String {
    param
  }
}

/// Reaches a T3 Code server through a tailcat tunnel. `forward` blocks while the tunnel comes up,
/// so it runs on the module's background queue.
public final class T3TailcatModule: Module {
  public func definition() -> ModuleDefinition {
    Name("T3Tailcat")

    AsyncFunction("forward") { (address: String, port: Int) -> Int in
      guard let remotePort = UInt16(exactly: port) else {
        throw TailcatForwardException("The tailcat port is out of range.")
      }
      var failure: UnsafeMutablePointer<CChar>?
      let localPort = t3tc_forward(address, remotePort, &failure)
      if let failure {
        defer { t3tc_free(failure) }
        throw TailcatForwardException(String(cString: failure))
      }
      return Int(localPort)
    }
  }
}
