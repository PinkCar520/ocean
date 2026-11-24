import SwiftUI

/// Neutral initialization surface, distinct from the personal agent.
struct FirstEncounterView: View {
    @Bindable var session: FirstEncounterSession
    @State private var answer = ""

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            VStack(spacing: 26) {
                Spacer()
                if case .question(let index) = session.phase {
                    waveform
                    Text(session.currentQuestion ?? "")
                        .font(.system(size: 27, weight: .medium))
                        .foregroundStyle(.white)
                        .multilineTextAlignment(.center)
                        .accessibilityIdentifier("encounter.question.\(index)")
                    if index == 0 {
                        Text("每次提交的回答都将安全保存在本机，退出后可继续。完成后可在 Memory 中查看和删除。")
                            .font(.footnote)
                            .foregroundStyle(.white.opacity(0.65))
                            .multilineTextAlignment(.center)
                    }
                    if index == 1 {
                        HStack(spacing: 16) {
                            Button("男性声音") { session.chooseVoice(.masculine) }
                            Button("女性声音") { session.chooseVoice(.feminine) }
                        }
                        .buttonStyle(.borderedProminent)
                    } else {
                        TextField("你的回答", text: $answer, axis: .vertical)
                            .lineLimit(2...4)
                            .padding(14)
                            .background(.white.opacity(0.14), in: RoundedRectangle(cornerRadius: 14))
                            .foregroundStyle(.white)
                            .tint(.white)
                            .accessibilityIdentifier("encounter.answer")
                        Button("继续") { session.answer(answer) }
                            .buttonStyle(.borderedProminent)
                            .disabled(answer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        Button("跳过") { session.skip() }
                            .foregroundStyle(.white.opacity(0.7))
                    }
                    Text("\(index + 1) / 3")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.white.opacity(0.5))
                } else if session.phase == .awakening {
                    Circle().fill(.white).frame(width: 18, height: 18)
                        .shadow(color: .white.opacity(0.65), radius: 20)
                    Text("你好。")
                        .font(.largeTitle).foregroundStyle(.white)
                    Text("这是文字预览；首次苏醒的语音与 Eye 动画尚未接入。")
                        .font(.footnote).foregroundStyle(.white.opacity(0.6))
                    Button("进入 OLO") { session.finishAwakening() }
                        .buttonStyle(.borderedProminent)
                }
                if let error = session.errorMessage {
                    Text(error).font(.footnote).foregroundStyle(.orange)
                }
                Spacer()
            }
            .padding(24)
        }
        .onChange(of: session.phase) { _, _ in answer = "" }
    }

    private var waveform: some View {
        HStack(spacing: 5) {
            ForEach(0..<7, id: \.self) { index in
                Capsule()
                    .fill(.white.opacity(0.8))
                    .frame(width: 4, height: CGFloat([14, 25, 37, 44, 37, 25, 14][index]))
            }
        }
        .frame(height: 64)
        .accessibilityLabel("初始化系统")
    }
}
