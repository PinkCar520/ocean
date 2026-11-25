import XCTest
import SwiftUI
import WebKit
import UIKit
@testable import OLO

final class EncounterFluidVisualTests: XCTestCase {
    @MainActor
    func testNativeFramesMatchApprovedBrowserReference() async throws {
        let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "encounter-fluid-reference", withExtension: "html"))
        let web = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        let loader = ReferenceLoader()
        web.navigationDelegate = loader
        try await loader.load(web, html: String(contentsOf: url, encoding: .utf8)
            .replacingOccurrences(of: "if(!location.search.includes('snapshot'))", with: "if(false)"))
        var initialFrames: [String: [UInt8]] = [:]
        var metrics: [String] = []
        for (width, height) in [(390, 844), (844, 390), (390, 844), (430, 932), (932, 430), (430, 932)] {
            for seconds in [0.0, 0.5, 2.0, 7.25] {
                let scale = 2.0
                let encoded = try await web.evaluateJavaScript("renderFrame(\(width),\(height),\(seconds * 1000),\(scale))")
                let base64 = try XCTUnwrap(encoded as? String)
                let reference = try XCTUnwrap(UIImage(data: XCTUnwrap(Data(base64Encoded: base64))))
                let renderer = ImageRenderer(content: EncounterFluidFrame(time: seconds)
                    .frame(width: CGFloat(width), height: CGFloat(height)))
                renderer.scale = CGFloat(scale)
                renderer.isOpaque = true
                let actual = try XCTUnwrap(renderer.uiImage)
                let label = "\(width)x\(height)-\(seconds)s"
                XCTAssertEqual(reference.cgImage?.width, width * 2, label)
                XCTAssertEqual(reference.cgImage?.height, height * 2, label)
                XCTAssertEqual(actual.cgImage?.width, width * 2, label)
                XCTAssertEqual(actual.cgImage?.height, height * 2, label)
                let expectedPixels = try pixels(reference)
                let actualPixels = try pixels(actual)
                XCTAssertEqual(expectedPixels.count, actualPixels.count, label)
                guard expectedPixels.count == actualPixels.count else { continue }
                if width < height {
                    if let previous = initialFrames.removeValue(forKey: label) {
                        XCTAssertTrue(previous == actualPixels, "\(label): same phase after landscape resize")
                    } else {
                        initialFrames[label] = actualPixels
                    }
                }
                var difference = 0.0
                var ink = 0.0
                var actualInk = 0.0
                for i in stride(from: 0, to: expectedPixels.count, by: 4) {
                    for channel in 0..<3 {
                        let e = Double(expectedPixels[i + channel])
                        let a = Double(actualPixels[i + channel])
                        difference += abs(e - a)
                        ink += 255 - e
                        actualInk += 255 - a
                    }
                }
                XCTAssertGreaterThan(ink, 0, label)
                let error = difference / max(ink, 1)
                let coverage = actualInk / max(ink, 1)
                let metric = "\(label): normalized RGB=\(error), ink coverage=\(coverage)"
                print("OLO_VISUAL_METRIC \(metric)")
                metrics.append(metric)
                // Calibrated cross-renderer tolerances; never regenerate the reference from Swift.
                if error > 0.05 || abs(coverage - 1) > 0.005 {
                    for (name, image) in [("browser", reference), ("native", actual)] {
                        let attachment = XCTAttachment(image: image)
                        attachment.name = "\(label)-\(name)"
                        attachment.lifetime = .keepAlways
                        add(attachment)
                    }
                }
                XCTAssertLessThanOrEqual(error, 0.05, "\(label): normalized RGB difference")
                XCTAssertLessThanOrEqual(abs(coverage - 1), 0.005, "\(label): ink coverage")
            }
        }
        XCTAssertTrue(initialFrames.isEmpty)
        let report = XCTAttachment(string: metrics.joined(separator: "\n"))
        report.name = "visual-regression-metrics"
        report.lifetime = .keepAlways
        add(report)
    }

    private func pixels(_ image: UIImage) throws -> [UInt8] {
        let cg = try XCTUnwrap(image.cgImage)
        let width = cg.width, height = cg.height
        var bytes = [UInt8](repeating: 255, count: width * height * 4)
        try bytes.withUnsafeMutableBytes { buffer in
            let space = try XCTUnwrap(CGColorSpace(name: CGColorSpace.sRGB))
            let context = try XCTUnwrap(CGContext(data: buffer.baseAddress, width: width, height: height,
                bitsPerComponent: 8, bytesPerRow: width * 4, space: space,
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue))
            context.setFillColor(UIColor.white.cgColor)
            context.fill(CGRect(x: 0, y: 0, width: width, height: height))
            context.draw(cg, in: CGRect(x: 0, y: 0, width: width, height: height))
        }
        return bytes
    }
}

@MainActor
private final class ReferenceLoader: NSObject, WKNavigationDelegate {
    private var continuation: CheckedContinuation<Void, Error>?
    func load(_ web: WKWebView, html: String) async throws {
        try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            web.loadHTMLString(html, baseURL: nil)
        }
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        continuation?.resume()
        continuation = nil
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        continuation?.resume(throwing: error)
        continuation = nil
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        continuation?.resume(throwing: error)
        continuation = nil
    }
}
