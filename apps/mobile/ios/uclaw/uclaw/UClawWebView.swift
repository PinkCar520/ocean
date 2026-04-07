import SwiftUI
import WebKit
import Combine
import Foundation

#if os(iOS)
struct UClawWebView: UIViewRepresentable {
    let url: URL
    var onWebViewCreated: ((WKWebView) -> Void)? = nil
    
    func makeUIView(context: Context) -> WKWebView {
        let prefs = WKWebpagePreferences()
        prefs.allowsContentJavaScript = true
        let config = WKWebViewConfiguration()
        config.defaultWebpagePreferences = prefs
        config.allowsInlineMediaPlayback = true
        config.userContentController.add(context.coordinator, name: "uclaw")
        
        let scriptSource = "localStorage.setItem('uclaw_auth_token', 'mock-dev-token-xyz567'); localStorage.setItem('uclaw_user_id', '9527');"
        let userScript = WKUserScript(source: scriptSource, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        config.userContentController.addUserScript(userScript)
        
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.customUserAgent = "UClawNative/1.0 (iOS)"
        onWebViewCreated?(webView)
        webView.load(URLRequest(url: url))
        return webView
    }
    
    func updateUIView(_ uiView: WKWebView, context: Context) {}
    func makeCoordinator() -> WebViewCoordinator { WebViewCoordinator() }
}
#elseif os(macOS)
struct UClawWebView: NSViewRepresentable {
    let url: URL
    var onWebViewCreated: ((WKWebView) -> Void)? = nil
    
    func makeNSView(context: Context) -> WKWebView {
        let prefs = WKWebpagePreferences()
        prefs.allowsContentJavaScript = true
        let config = WKWebViewConfiguration()
        config.defaultWebpagePreferences = prefs
        config.userContentController.add(context.coordinator, name: "uclaw")
        
        let scriptSource = "localStorage.setItem('uclaw_auth_token', 'mock-dev-token-xyz567'); localStorage.setItem('uclaw_user_id', '9527');"
        let userScript = WKUserScript(source: scriptSource, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        config.userContentController.addUserScript(userScript)
        
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.setValue(false, forKey: "drawsBackground")
        webView.navigationDelegate = context.coordinator
        webView.customUserAgent = "UClawNative/1.0 (macOS)"
        onWebViewCreated?(webView)
        webView.load(URLRequest(url: url))
        return webView
    }
    
    func updateNSView(_ nsView: WKWebView, context: Context) {}
    func makeCoordinator() -> WebViewCoordinator { WebViewCoordinator() }
}
#endif

// 显式实现 ObservableObject，确保编译器识别
class SharedWebViewStore: NSObject, ObservableObject {
    @Published var activeWebView: WKWebView? = nil
}

class WebViewCoordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "uclaw", let body = message.body as? [String: Any] else { return }
        let action = body["action"] as? String
        if action == "haptic" {
            #if os(iOS)
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            #endif
        } else if action == "copyToClipboard", let text = body["text"] as? String {
            #if os(iOS)
            UIPasteboard.general.string = text
            #elseif os(macOS)
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(text, forType: .string)
            #endif
        }
    }
}
