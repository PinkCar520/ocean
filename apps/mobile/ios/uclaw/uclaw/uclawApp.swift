import SwiftUI
import SwiftData
import WebKit
import Combine

@main
struct uclawApp: App {
    #if os(macOS)
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    #endif
    
    @StateObject private var webStore = SharedWebViewStore()
    
    var sharedModelContainer: ModelContainer = {
        let schema = Schema([Item.self])
        let modelConfiguration = ModelConfiguration(schema: schema, isStoredInMemoryOnly: false)
        do {
            return try ModelContainer(for: schema, configurations: [modelConfiguration])
        } catch {
            fatalError("Could not create ModelContainer: \(error)")
        }
    }()

    var body: some Scene {
        #if os(macOS)
        // macOS Specific Scene: Menu Bar Extra
        MenuBarExtra("uClaw", systemImage: "sparkles") {
            Button("Open uClaw") {
                NSApp.activate(ignoringOtherApps: true)
            }
            Divider()
            Button("Quit uClaw") {
                NSApplication.shared.terminate(nil)
            }
        }
        #endif

        WindowGroup {
            ContentView()
                .environmentObject(webStore)
                .onOpenURL { url in
                    print("Handle deep link: \(url)")
                }
        }
        .modelContainer(sharedModelContainer)
        #if os(macOS)
        .windowStyle(.hiddenTitleBar)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("New Chat") {
                    webStore.activeWebView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('uclaw:newChat'))")
                }
                .keyboardShortcut("n", modifiers: .command)
                
                Button("Search / Command") {
                    webStore.activeWebView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('uclaw:toggleCommandMenu'))")
                }
                .keyboardShortcut("k", modifiers: .command)
            }
        }
        #endif
    }
}

#if os(macOS)
class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {}
}
#endif
