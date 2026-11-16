import SwiftUI

/// OLO World — other bodies OLO can move into (Robot, Vehicle, Home).
/// Reinforces "One OLO. Many Bodies." Phase 2 lists bodies as cards.
struct WorldView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                hero
                bodyCard("viewfinder", "OLO Robot", "连接后：移动、拿取、整理、观察。", connected: false)
                bodyCard("car.fill", "OLO Vehicle", "连接后：接送、路线、行程与空间。", connected: false)
                loopCard
            }
            .padding(18)
        }
        .background(Color(white: 0.95).gradient)
        .scrollIndicators(.hidden)
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("OLO World".uppercased())
                .font(.caption2).tracking(1.4).foregroundStyle(.secondary)
            Text("身体，是可调用的。")
                .font(.largeTitle.bold()).kerning(-1.2)
            Text("OLO One 只是入口。未来它可以把意图交给机器人、汽车和家庭。")
                .font(.footnote).foregroundStyle(.secondary)
        }
        .padding(.top, 8)
    }

    private func bodyCard(_ icon: String, _ title: String, _ detail: String, connected: Bool) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon).font(.title2)
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.subheadline.bold())
                Text(detail).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Text(connected ? "已连接" : "未连接")
                .font(.caption2).foregroundStyle(connected ? Color.green : Color.secondary)
        }
        .padding(16)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 24))
        .overlay(RoundedRectangle(cornerRadius: 24).stroke(.black.opacity(0.06)))
    }

    private var loopCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Agent Loop".uppercased())
                .font(.caption2).tracking(1.4).foregroundStyle(.secondary)
                .padding(.bottom, 10)
            step("1", "Observe", "理解环境、你的位置与当前上下文。")
            Divider().opacity(0.5)
            step("2", "Think", "规划最少打扰你的完成路径。")
            Divider().opacity(0.5)
            step("3", "Act", "调用正确的身体，并验证结果。")
        }
        .padding(18)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 24))
        .overlay(RoundedRectangle(cornerRadius: 24).stroke(.black.opacity(0.06)))
    }

    private func step(_ num: String, _ title: String, _ detail: String) -> some View {
        HStack(spacing: 12) {
            Text(num).font(.callout.bold())
                .frame(width: 28, height: 28)
                .background(.quaternary.opacity(0.5), in: Circle())
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.subheadline.bold())
                Text(detail).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(.vertical, 12)
    }
}
