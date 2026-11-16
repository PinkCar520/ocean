import SwiftUI

/// Voice interaction surface. Phase 3 surfaces live voice state + the most
/// recent transcript / AgentRequest produced. Phase 4 hands the request to
/// the LLM from here too. Real recognition is driven from HomeView's
/// "press and hold OLO" gesture; this page is the inspection view.
struct VoiceView: View {
    @Environment(OLOCenter.self) private var center

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Voice".uppercased())
                        .font(.caption2).tracking(1.4).foregroundStyle(.secondary)
                    Text("听你说话。")
                        .font(.largeTitle.bold()).kerning(-1.2)
                    Text("按住 OLO 说话，松开发送。识别完成后这里显示 OLO 理解到的请求。")
                        .font(.footnote).foregroundStyle(.secondary)
                }

                statusCard
                transcriptCard
            }
            .padding(18)
        }
        .background(Color(white: 0.95).gradient)
        .scrollIndicators(.hidden)
    }

    private var statusCard: some View {
        HStack {
            iconBadge("waveform")
            VStack(alignment: .leading, spacing: 3) {
                Text("当前状态").font(.subheadline.bold())
                Text(center.state.label).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(16)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 24))
        .overlay(RoundedRectangle(cornerRadius: 24).stroke(.black.opacity(0.06)))
    }

    private var transcriptCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("最近一次识别".uppercased())
                .font(.caption2).tracking(1.4).foregroundStyle(.secondary)
            if let request = center.lastVoiceRequest {
                Text(request.input)
                    .font(.body.bold())
                HStack {
                    Label(request.source.rawValue, systemImage: "tag.fill")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            } else {
                Text("还没有识别内容。回到首页按住 OLO 说话。")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 24))
        .overlay(RoundedRectangle(cornerRadius: 24).stroke(.black.opacity(0.06)))
    }

    private func iconBadge(_ system: String) -> some View {
        Image(systemName: system)
            .font(.callout)
            .frame(width: 32, height: 32)
            .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 11))
    }
}
