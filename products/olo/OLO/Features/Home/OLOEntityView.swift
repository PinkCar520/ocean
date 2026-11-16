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

    var body: some View {
        ZStack {
            orb
            logo
            highlightBar
            if !center.privacyMode { cameraDot }
        }
        .frame(width: 205, height: 205)
        .overlay(Circle().stroke(borderColor, lineWidth: 7))
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

    private var logo: some View {
        Text("OLO")
            .font(.system(size: 29, weight: .bold))
            .foregroundStyle(.white)
            .kerning(-2)
            .opacity(center.privacyMode ? 0 : 1)
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
