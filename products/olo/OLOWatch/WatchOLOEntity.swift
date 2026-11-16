import SwiftUI

/// The OLO face for the watch body — `O | O` design.
///
/// Identity: two eyes (left + right) + a center mark (the "state core")
/// + a mouth (constant short line).
///
/// The `O | O` reads as both a brand symbol AND a face:
///   • Eyes change shape per state (outline/solid/curve/star)
///   • Center mark changes per state (`|`, `•`, `✦`, `◉`) — the AI breath
///   • Mouth stays constant (or waves when speaking)
///
/// State → Face mapping:
///   idle      — O | O  +  —      (resting, brand mode)
///   listening — ◉ | ◉  +  —      (focused, eyes solid)
///   thinking  — ⌒ | •  +  —      (processing, center = dot)
///   acting    — O | ✦  +  ≈      (executing, mouth waves)
///   needYou   — ◉ | ◉  +  —      (attention, eyes solid + pulse)
///   done      — ⌒ | |  +  ˘      (success, smile mouth)
///   privacy   — (nothing, screen off)
///   powerOff  — (nothing, screen off)
struct WatchOLOEntity: View {
    @Environment(WatchOLOCenter.self) private var center

    @State private var pulse = false
    @State private var glow = false
    @State private var breathe = false

    var body: some View {
        GeometryReader { proxy in
            let side = min(proxy.size.width, proxy.size.height)
            let eyeW = side * 0.12
            let eyeH = side * 0.12
            let eyeSpacing = side * 0.22
            let centerY = -side * 0.06
            let mouthY = side * 0.20

            ZStack {
                Color.black.ignoresSafeArea()

                if center.privacyMode || center.state == .powerOff {
                    // Screen off
                } else {
                    // Eyes
                    HStack(spacing: eyeSpacing) {
                        leftEye(w: eyeW, h: eyeH, side: side)
                        rightEye(w: eyeW, h: eyeH, side: side)
                    }
                    .offset(y: centerY)

                    // Center mark (state core)
                    centerMark(side: side)
                        .offset(y: centerY)

                    // Mouth
                    mouth(side: side)
                        .offset(y: mouthY)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .scaleEffect(currentScale)
            .rotation3DEffect(.degrees(center.privacyMode ? 180 : 0),
                              axis: (x: 0, y: 1, z: 0), perspective: 0.6)
            .onChange(of: center.state) { _, new in startAnimations(for: new) }
            .onChange(of: center.privacyMode) { _, _ in
                withAnimation(.easeInOut(duration: 0.35)) {}
            }
            .task(id: center.state == .done) { await runDoneReset() }
            .onAppear { startAnimations(for: center.state) }
        }
    }

    // MARK: - Eyes

    @ViewBuilder
    private func leftEye(w: CGFloat, h: CGFloat, side: CGFloat) -> some View {
        eyeShape(w: w, h: h, side: side)
    }

    @ViewBuilder
    private func rightEye(w: CGFloat, h: CGFloat, side: CGFloat) -> some View {
        eyeShape(w: w, h: h, side: side)
    }

    @ViewBuilder
    private func eyeShape(w: CGFloat, h: CGFloat, side: CGFloat) -> some View {
        let lineW = side * 0.024
        switch center.state {
        case .idle, .acting, .error:
            // O — outline circle (brand mode / acting)
            Circle()
                .stroke(.white, lineWidth: lineW)
                .frame(width: w, height: h)

        case .listening:
            // Vertical oval | — alert/focused (tall capsule)
            Capsule()
                .fill(.white)
                .frame(width: w * 0.35, height: h * 1.1)
                .scaleEffect(pulse ? 1.08 : 0.92)
                .opacity(pulse ? 1.0 : 0.7)

        case .needYou:
            // ◉ — solid circle (attention)
            Circle()
                .fill(.white)
                .frame(width: w * 0.85, height: h * 0.85)
                .scaleEffect(pulse ? 1.08 : 0.92)
                .opacity(pulse ? 1.0 : 0.7)

        case .thinking, .done:
            // ⌒ — upward curve (processing / success)
            UpCurve()
                .stroke(.white, style: StrokeStyle(lineWidth: lineW, lineCap: .round))
                .frame(width: w, height: h * 0.6)

        case .privacy, .powerOff:
            EmptyView()
        }
    }

    // MARK: - Center mark (state core)

    @ViewBuilder
    private func centerMark(side: CGFloat) -> some View {
        let lineW = side * 0.024
        switch center.state {
        case .idle, .done, .listening, .error:
            // | — vertical bar (the AI breath). Listening 中隐藏在 centerMark。
            Capsule()
                .fill(.white)
                .frame(width: side * 0.028, height: side * 0.10)
                .opacity(center.state == .listening ? 0 : 1.0)

        case .thinking:
            // • — dot (understanding)
            Circle()
                .fill(.white)
                .frame(width: side * 0.06, height: side * 0.06)
                .shadow(color: .white.opacity(glow ? 0.8 : 0.2), radius: side * 0.02)

        case .acting:
            // ✦ — small star (executing)
            StarShape()
                .fill(.white)
                .frame(width: side * 0.10, height: side * 0.10)

        case .needYou:
            // ◉ — ring (observing / handoff)
            Circle()
                .stroke(.white, lineWidth: lineW)
                .frame(width: side * 0.06, height: side * 0.06)
                .scaleEffect(pulse ? 1.1 : 0.9)

        case .privacy, .powerOff:
            EmptyView()
        }
    }

    // MARK: - Mouth

    /// Mouth — constant short horizontal line for ALL states.
    private func mouth(side: CGFloat) -> some View {
        Capsule()
            .fill(.white)
            .frame(width: side * 0.14, height: side * 0.016)
    }

    // MARK: - State-driven values

    private var currentScale: CGFloat {
        let breath = (breathe && center.state == .thinking) ? 0.03 : 0
        let pulseS = (pulse && center.state == .listening) ? 0.035 : 0
        let base: CGFloat
        switch center.state {
        case .acting:  base = 0.04
        case .needYou: base = 0.015
        default:       base = 0
        }
        return 1.0 + base + breath + pulseS
    }

    // MARK: - Animation lifecycle

    private func startAnimations(for state: OLOState) {
        switch state {
        case .thinking:
            withAnimation(.easeInOut(duration: 1.1).repeatForever(autoreverses: true)) { breathe = true }
            withAnimation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true)) { glow = true }
            pulse = false
        case .listening, .needYou:
            withAnimation(.easeInOut(duration: 0.7).repeatForever(autoreverses: true)) { pulse = true }
            withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) { breathe = true }
            glow = false
        case .done:
            breathe = false; pulse = false; glow = false
        default:
            breathe = false; pulse = false; glow = false
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

// MARK: - Shapes

/// Upward curve ⌒ — like a smile / happy closed eye.
struct UpCurve: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.minX, y: rect.maxY))
        p.addQuadCurve(
            to: CGPoint(x: rect.maxX, y: rect.maxY),
            control: CGPoint(x: rect.midX, y: rect.minY)
        )
        return p
    }
}

/// Wavy line ≈ — for speaking mouth.
struct WavyShape: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        let w = rect.width
        let h = rect.height
        let midY = rect.midY
        p.move(to: CGPoint(x: rect.minX, y: midY))
        p.addQuadCurve(
            to: CGPoint(x: rect.minX + w * 0.5, y: midY),
            control: CGPoint(x: rect.minX + w * 0.25, y: midY - h * 0.6)
        )
        p.addQuadCurve(
            to: CGPoint(x: rect.maxX, y: midY),
            control: CGPoint(x: rect.minX + w * 0.75, y: midY + h * 0.6)
        )
        return p
    }
}

/// Four-pointed star ✦ — celebratory / executing.
struct StarShape: Shape {
    func path(in rect: CGRect) -> Path {
        let cx = rect.midX
        let cy = rect.midY
        let r = min(rect.width, rect.height) * 0.5
        var p = Path()
        let points = [
            CGPoint(x: cx, y: cy - r),
            CGPoint(x: cx + r * 0.25, y: cy - r * 0.25),
            CGPoint(x: cx + r, y: cy),
            CGPoint(x: cx + r * 0.25, y: cy + r * 0.25),
            CGPoint(x: cx, y: cy + r),
            CGPoint(x: cx - r * 0.25, y: cy + r * 0.25),
            CGPoint(x: cx - r, y: cy),
            CGPoint(x: cx - r * 0.25, y: cy - r * 0.25),
        ]
        p.move(to: points[0])
        for i in 1..<points.count { p.addLine(to: points[i]) }
        p.closeSubpath()
        return p
    }
}
