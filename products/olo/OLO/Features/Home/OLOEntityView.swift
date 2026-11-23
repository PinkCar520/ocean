import SwiftUI

/// OLO's visible presence on a body. Renders the seven `OLOState`s as
/// motion — the same identity expresses itself the same way on any body.
///
/// Phase 2 only animates state; real voice / agent wiring lands in Phase 3+.
/// The entity reads `OLOCenter.state` so any body that hosts an `OLOCenter`
/// gets the entity's behaviour for free.
struct OLOEntityView: View {
    @Environment(OLOCenter.self) private var center

    @State private var breathing = false
    @State private var pulsing = false
    @State private var flash = false
    /// Real microphone amplitude, forwarded by the Voice host.
    var audioLevel: Float = 0
    var isResponding: Bool = false

    var body: some View {
        ZStack {
            orb
            logo
            if showsLuminousPresence {
                OLOLuminousPresence(level: audioLevel, state: center.state, responding: isResponding)
                    .frame(width: 112, height: 48)
                    .offset(y: 64)
                    .transition(.opacity)
            } else {
                highlightBar
            }
            if !center.privacyMode { cameraDot }
        }
        .animation(.easeInOut(duration: 0.35), value: showsLuminousPresence)
        .frame(width: 205, height: 205)
        .overlay {
            Circle().stroke(borderColor, lineWidth: 7)
        }
        .shadow(color: .black.opacity(0.32), radius: 28, y: 22)
        .overlay(flashOverlay)
        .scaleEffect(currentScale)
        .offset(x: shakeOffset)
        .rotation3DEffect(.degrees(center.privacyMode ? 180 : 0), axis: (x: 0, y: 1, z: 0), perspective: 0.6)
        .onChange(of: center.state) { _, new in startAnimations(for: new) }
        .onChange(of: center.privacyMode) { _, _ in
            withAnimation(.easeInOut(duration: 0.35)) {}
        }
        .task(id: center.state == .done) { await runDoneReset() }
        .onAppear { startAnimations(for: center.state) }
    }

    private var showsLuminousPresence: Bool {
        !center.privacyMode && (center.state == .listening || center.state == .thinking || isResponding)
    }

    // MARK: - Parts

    private var orb: some View {
        Circle()
            .fill(
                RadialGradient(
                    colors: [Color(white: 0.20), .black],
                    center: UnitPoint(x: 0.33, y: 0.22),
                    startRadius: 2,
                    endRadius: 120
                )
            )
    }

    /// Soft, tilted elliptical Ambient Eye replaces the OLO wordmark.
    /// Preserve the existing orb, light bar, camera dot and voice states.
    private var logo: some View {
        Ellipse()
            .fill(
                RadialGradient(
                    colors: [
                        Color.white.opacity(0.96),
                        Color(white: 0.88).opacity(0.80),
                        Color(white: 0.68).opacity(0.22)
                    ],
                    center: UnitPoint(x: 0.42, y: 0.38),
                    startRadius: 2,
                    endRadius: 65
                )
            )
            .frame(width: 84, height: 48)
            .rotationEffect(.degrees(-35))
            .offset(x: -25, y: -35)
            .opacity(center.privacyMode ? 0 : 1)
            .accessibilityHidden(true)
    }

    private var highlightBar: some View {
        Group {
            if center.privacyMode {
                Circle()
                    .fill(Color(white: 0.6))
                    .frame(width: 12, height: 12)
            } else {
                Capsule()
                    .fill(.white)
                    .frame(width: barWidth, height: barHeight)
                    .shadow(color: .white.opacity(0.9), radius: glowRadius)
            }
        }
        .offset(y: 64)
        .animation(.spring(response: 0.45, dampingFraction: 0.8), value: center.state)
        .animation(.spring(response: 0.35), value: center.privacyMode)
    }

    /// The small black dot near the top of the orb — OLO's "eye". Matches the
    /// OLO One physical prototype and is hidden in privacy mode.
    private var cameraDot: some View {
        Circle()
            .fill(Color(white: 0.02))
            .overlay(Circle().stroke(.gray.opacity(0.7), lineWidth: 1))
            .frame(width: 8, height: 8)
            .offset(y: -82)
    }

    private var flashOverlay: some View {
        Circle()
            .fill(.white)
            .opacity(flash ? 0.55 : 0)
            .allowsHitTesting(false)
    }

    // MARK: - State-driven values

    private var currentScale: CGFloat {
        let breath = (breathing && center.state == .thinking) ? 0.03 : 0
        let pulse = (pulsing && center.state == .listening) ? 0.035 : 0
        let base: CGFloat
        switch center.state {
        case .acting: base = 0.04
        case .needYou: base = 0.015
        default: base = 0
        }
        return 1.0 + base + breath + pulse
    }

    private var barWidth: CGFloat {
        switch center.state {
        case .idle, .done, .error: 30
        case .listening: 72
        case .thinking: 10
        case .needYou: 12
        case .acting: 88
        case .privacy, .powerOff: 0
        }
    }

    private var barHeight: CGFloat {
        center.state == .thinking || center.state == .needYou ? 10 : 4
    }

    private var glowRadius: CGFloat {
        center.state == .idle ? 12 : 18
    }

    private var borderColor: Color {
        center.state == .error ? Color(red: 0.85, green: 0.25, blue: 0.2) : Color(white: 0.67)
    }

    private var shakeOffset: CGFloat {
        guard center.state == .error, pulsing else { return 0 }
        return 3.0
    }

    // MARK: - Animation lifecycle

    private func startAnimations(for state: OLOState) {
        switch state {
        case .thinking:
            withAnimation(.easeInOut(duration: 1.1).repeatForever(autoreverses: true)) { breathing = true }
            pulsing = false
        case .listening:
            withAnimation(.easeInOut(duration: 0.7).repeatForever(autoreverses: true)) { pulsing = true }
            breathing = false
        case .error:
            // brief shake
            withAnimation(.easeInOut(duration: 0.05).repeatCount(6, autoreverses: true)) { pulsing = true }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { pulsing = false }
            breathing = false
        case .done:
            breathing = false; pulsing = false
            flash = true
            withAnimation(.easeOut(duration: 0.4)) { flash = false }
        default:
            breathing = false; pulsing = false
        }
    }

    @MainActor
    private func runDoneReset() async {
        guard center.state == .done else { return }
        try? await Task.sleep(for: .seconds(1.3))
        guard center.state == .done else { return }
        withAnimation { center.state = .idle }
    }
}

/// A SwiftUI Canvas light ribbon inspired by the supplied Siri interaction
/// reference. This is OLO's own rendering, not Apple's proprietary effect.
/// Lives at the entity's mouth position, replacing its static light bar during voice activity.
private struct OLOLuminousPresence: View {
    let level: Float
    let state: OLOState
    let responding: Bool

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: false)) { timeline in
            let time = timeline.date.timeIntervalSinceReferenceDate
            Canvas(opaque: false, rendersAsynchronously: true) { context, size in
                let listening = state == .listening
                let energy = listening ? min(1, max(0.06, Double(level))) : (responding ? 0.36 : 0.16)
                let centerY = size.height * 0.5
                let width = size.width
                let halfWidth = width * 0.46
                let height = 1.5 + energy * 8
                let phase = time * (listening ? 4.8 : 2.1)
                var ribbon = Path()
                for step in 0...100 {
                    let fraction = Double(step) / 100
                    let x = width * 0.5 + (fraction * 2 - 1) * halfWidth
                    let envelope = pow(max(0, 1 - pow(fraction * 2 - 1, 2)), 1.6)
                    let wave = sin(fraction * 12.5 - phase) * height * envelope
                    let secondary = sin(fraction * 6.2 + phase * 0.65) * height * 0.3 * envelope
                    let point = CGPoint(x: x, y: centerY + wave + secondary)
                    if step == 0 { ribbon.move(to: point) }
                    else { ribbon.addLine(to: point) }
                }
                let start = CGPoint(x: width * 0.06, y: centerY)
                let end = CGPoint(x: width * 0.94, y: centerY)
                context.drawLayer { glow in
                    glow.addFilter(.blur(radius: 13))
                    glow.stroke(ribbon, with: .linearGradient(
                        Gradient(colors: [.clear, Color(white: 0.62).opacity(0.6), .white, Color(white: 0.82).opacity(0.7), .clear]),
                        startPoint: start, endPoint: end
                    ), style: StrokeStyle(lineWidth: 9, lineCap: .round))
                }
                context.stroke(ribbon, with: .linearGradient(
                    Gradient(colors: [.clear, Color(white: 0.62).opacity(0.65), .white, Color(white: 0.82).opacity(0.8), .clear]),
                    startPoint: start, endPoint: end
                ), style: StrokeStyle(lineWidth: 2.5 + energy * 1.5, lineCap: .round))
                context.stroke(ribbon, with: .color(.white.opacity(0.9)),
                               style: StrokeStyle(lineWidth: 0.8, lineCap: .round))
            }
        }
        .accessibilityLabel(state == .listening ? "OLO 正在聆听" : responding ? "OLO 正在回应" : "OLO 正在思考")
        .accessibilityIdentifier("olo.entity.luminous")
        .allowsHitTesting(false)
    }
}
