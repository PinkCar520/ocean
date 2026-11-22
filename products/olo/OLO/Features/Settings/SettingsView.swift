import SwiftUI
import SwiftData
import AVFoundation
import Speech

/// Settings — OLO's tuning panel.
///
/// Sections:
///   1. Identity       — who OLO is on this body (name, pronouns, born-on)
///   2. Voice          — mic + speech recognition permission state, with a
///                       one-tap shortcut to System Settings if denied.
///   3. Privacy        — software flip of the privacy switch. Equivalent to
///                       double-tapping the OLO One physical shell.
///   4. Debug / Reset   — counts of long-term memory + agent task history
///                       stored on this body, with a destructive "clear
///                       everything" action (useful in dev / demos).
///   5. About           — version, build, and the "One OLO. Many Bodies."
///                       one-liner.
///
/// Voice permission reads `AVAudioApplication.recordPermission` (sync) and
/// `SFSpeechRecognizer.authorizationStatus()` (sync) on appear and on
/// `scenePhase` change, because the user can flip the switch in System
/// Settings while the app is backgrounded.
struct SettingsView: View {
    @Environment(OLOCenter.self) private var center
    @Environment(\.modelContext) private var modelContext
    @Environment(\.scenePhase) private var scenePhase

    @State private var micGranted: Bool = AVAudioApplication.shared.recordPermission == .granted
    @State private var speechStatus: SFSpeechRecognizerAuthorizationStatus = SFSpeechRecognizer.authorizationStatus()
    @State private var memoryCount: Int = 0
    @State private var taskCount: Int = 0
    @State private var showResetConfirmation = false
    @State private var toastText = ""
    @State private var toastShown = false
    @State private var requestingVoice = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                hero
                identityCard
                connectedWorldCard
                voiceCard
                privacyCard
                wakeValidationCard
                debugCard
                aboutCard
            }
            .padding(.horizontal, 18)
            .padding(.bottom, 32)
        }
        .background(LinearGradient(colors: [Color(white: 0.95), Color(white: 0.87)], startPoint: .top, endPoint: .bottom))
        .scrollIndicators(.hidden)
        .overlay(alignment: .top) {
            OLOToast(text: toastText, isShown: $toastShown)
                .padding(.top, 8)
                .allowsHitTesting(false)
        }
        .confirmationDialog(
            "清空 OLO 在这台机身的所有记忆？",
            isPresented: $showResetConfirmation,
            titleVisibility: .visible
        ) {
            Button("清空记忆与任务历史", role: .destructive, action: resetEverything)
            Button("取消", role: .cancel) {}
        } message: {
            Text("这会删除 \(memoryCount) 条长期记忆与 \(taskCount) 条任务历史。OLO Identity 不受影响。不可撤销。")
        }
        .task { await refreshAll() }
        .onChange(of: scenePhase) { _, _ in refreshPermissions() }
    }

    // MARK: - Hero

    private var hero: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Settings".uppercased())
                .font(.caption2).tracking(1.4).foregroundStyle(.secondary)
            Text("调教 OLO。")
                .font(.largeTitle.bold().lowercaseSmallCaps())
                .kerning(-1.2)
            Text("身份、语音、权限、隐私与开发调试。")
                .font(.footnote).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 8)
    }

    // MARK: - 1. Identity

    private var identityCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Identity".uppercased())
                .font(.caption2).tracking(1.4).foregroundStyle(.secondary)
                .padding(.bottom, 12)
            HStack(spacing: 14) {
                ZStack {
                    Circle()
                        .fill(
                            RadialGradient(
                                colors: [Color(white: 0.20), .black],
                                center: UnitPoint(x: 0.33, y: 0.22),
                                startRadius: 2,
                                endRadius: 40
                            )
                        )
                        .overlay(Circle().stroke(.white.opacity(0.12), lineWidth: 1))
                        .frame(width: 64, height: 64)
                    Text("OLO")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(.white)
                        .kerning(-1)
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text(center.identity.name)
                        .font(.title3.bold())
                    Text(center.identity.pronouns)
                        .font(.caption).foregroundStyle(.secondary)
                    Text("出生于 \(birthDateFormatter.string(from: center.identity.createdAt))")
                        .font(.caption2).foregroundStyle(.tertiary)
                }
                Spacer()
                stateBadge
            }
        }
        .padding(18)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 24))
        .overlay(RoundedRectangle(cornerRadius: 24).stroke(.black.opacity(0.06)))
    }

    private var stateBadge: some View {
        VStack(spacing: 3) {
            Circle()
                .fill(stateBadgeColor)
                .frame(width: 8, height: 8)
            Text(center.state.label)
                .font(.caption2).foregroundStyle(.secondary)
        }
    }

    private var stateBadgeColor: Color {
        switch center.state {
        case .idle: .secondary
        case .listening: .blue
        case .thinking: .purple
        case .needYou: .orange
        case .acting: .green
        case .done: .green
        case .privacy: .gray
        case .powerOff: .gray
        case .error: .red
        }
    }

    // MARK: - Connected World

    private var connectedWorldCard: some View {
        NavigationLink {
            WorldView()
        } label: {
            HStack(spacing: 12) {
                iconBadge("globe")
                VStack(alignment: .leading, spacing: 3) {
                    Text("Connected World").font(.subheadline.bold())
                    Text("管理 OLO 可连接的设备与现实世界能力。")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(.tertiary)
            }
            .padding(18)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 24))
            .overlay(RoundedRectangle(cornerRadius: 24).stroke(.black.opacity(0.06)))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("world.entry")
    }

    // MARK: - 2. Voice

    private var voiceCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Voice".uppercased())
                .font(.caption2).tracking(1.4).foregroundStyle(.secondary)
                .padding(.bottom, 10)
            permissionRow(
                icon: "mic.fill",
                title: "麦克风",
                detail: micGranted ? "已授权" : "未授权",
                granted: micGranted
            )
            Divider().opacity(0.5).padding(.vertical, 4)
            permissionRow(
                icon: "waveform.badge.mic",
                title: "语音识别",
                detail: speechStatusLabel,
                granted: speechStatus == .authorized
            )
            Divider().opacity(0.5).padding(.vertical, 4)
            if micGranted && speechStatus == .authorized {
                Button {
                    openSystemSettings()
                } label: {
                    settingsRowLabel(icon: "gearshape", title: "在系统设置中管理", detail: "跳转到 Settings → OLO")
                }
                .buttonStyle(.plain)
            } else {
                Button {
                    requestVoicePermission()
                } label: {
                    HStack {
                        settingsRowLabel(
                            icon: "hand.raised.fill",
                            title: "请求权限",
                            detail: requestingVoice ? "请求中…" : "OLO 需要麦克风和语音识别"
                        )
                        Spacer()
                        Image(systemName: "chevron.right").foregroundStyle(.tertiary).font(.caption)
                    }
                }
                .buttonStyle(.plain)
                .disabled(requestingVoice)
            }
        }
        .padding(18)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 24))
        .overlay(RoundedRectangle(cornerRadius: 24).stroke(.black.opacity(0.06)))
    }

    private var speechStatusLabel: String {
        switch speechStatus {
        case .authorized: "已授权"
        case .denied: "已拒绝"
        case .restricted: "受限"
        case .notDetermined: "未询问"
        @unknown default: "未知"
        }
    }

    private var wakeValidationCard: some View {
        NavigationLink {
            WakePlannerView()
        } label: {
            HStack(spacing: 12) {
                iconBadge("sunrise")
                VStack(alignment: .leading, spacing: 3) {
                    Text("SR-001 · 起床计划").font(.subheadline.bold())
                    Text("手动查看与开发验证；日常入口是 Home 长按后说话。")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(.tertiary)
            }
            .padding(18)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 24))
            .overlay(RoundedRectangle(cornerRadius: 24).stroke(.black.opacity(0.06)))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("wake.debug.entry")
    }

    private func permissionRow(icon: String, title: String, detail: String, granted: Bool) -> some View {
        HStack(spacing: 12) {
            iconBadge(icon)
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.subheadline.bold())
                Text(detail).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Image(systemName: granted ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                .foregroundStyle(granted ? .green : .orange)
                .font(.title3)
        }
        .padding(.vertical, 6)
    }

    // MARK: - 3. Privacy

    private var privacyCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Privacy".uppercased())
                .font(.caption2).tracking(1.4).foregroundStyle(.secondary)
                .padding(.bottom, 10)
            Toggle(isOn: Binding(
                get: { center.privacyMode },
                set: { newValue in flipPrivacy(to: newValue) }
            )) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("隐私模式").font(.subheadline.bold())
                    Text("翻转 OLO，立即停止视觉感知。").font(.caption).foregroundStyle(.secondary)
                }
            }
            .tint(.primary)
            .padding(.vertical, 6)
        }
        .padding(18)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 24))
        .overlay(RoundedRectangle(cornerRadius: 24).stroke(.black.opacity(0.06)))
    }

    @MainActor
    private func flipPrivacy(to newValue: Bool) {
        if newValue {
            Task { await center.voiceService?.stop() }
            center.liveTranscript = ""
            center.state = .idle
        }
        withAnimation(.easeInOut(duration: 0.35)) {
            center.privacyMode = newValue
        }
        showToast(newValue ? "视觉感知已关闭" : "隐私模式已关闭")
    }

    // MARK: - 4. Debug / Reset

    private var debugCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Debug".uppercased())
                .font(.caption2).tracking(1.4).foregroundStyle(.secondary)
                .padding(.bottom, 10)
            countRow(icon: "brain.head.profile", title: "长期记忆", count: memoryCount)
            Divider().opacity(0.5).padding(.vertical, 4)
            countRow(icon: "list.bullet.rectangle", title: "任务历史", count: taskCount)
            Divider().opacity(0.5).padding(.vertical, 4)
            Button(role: .destructive) {
                showResetConfirmation = true
            } label: {
                HStack(spacing: 12) {
                    iconBadge("trash.fill")
                    VStack(alignment: .leading, spacing: 3) {
                        Text("清空本机数据").font(.subheadline.bold())
                        Text("删除所有记忆与任务历史。OLO Identity 保留。").font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                }
            }
            .buttonStyle(.plain)
            .disabled(memoryCount == 0 && taskCount == 0)
            .padding(.vertical, 6)
        }
        .padding(18)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 24))
        .overlay(RoundedRectangle(cornerRadius: 24).stroke(.black.opacity(0.06)))
    }

    private func countRow(icon: String, title: String, count: Int) -> some View {
        HStack(spacing: 12) {
            iconBadge(icon)
            Text(title).font(.subheadline.bold())
            Spacer()
            Text("\(count)")
                .font(.subheadline.monospacedDigit())
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 6)
    }

    // MARK: - 5. About

    private var aboutCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("About".uppercased())
                .font(.caption2).tracking(1.4).foregroundStyle(.secondary)
            Text("One OLO. Many Bodies.")
                .font(.headline)
            Text("OLO 是一个会学习的身份，而不是一台硬件。同一份记忆，可以从 iPhone 走到 OLO One，再走向机器人、汽车和家庭。")
                .font(.caption).foregroundStyle(.secondary)
            HStack(spacing: 6) {
                Text("OLO")
                    .font(.caption.bold())
                Text(versionString)
                    .font(.caption2).foregroundStyle(.tertiary)
                Text("·")
                    .font(.caption2).foregroundStyle(.tertiary)
                Text("Build \(buildString)")
                    .font(.caption2).foregroundStyle(.tertiary)
            }
            .padding(.top, 4)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 24))
        .overlay(RoundedRectangle(cornerRadius: 24).stroke(.black.opacity(0.06)))
    }

    // MARK: - Helpers

    private func iconBadge(_ system: String) -> some View {
        Image(systemName: system)
            .font(.callout)
            .frame(width: 32, height: 32)
            .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 11))
    }

    private func settingsRowLabel(icon: String, title: String, detail: String) -> some View {
        HStack(spacing: 12) {
            iconBadge(icon)
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.subheadline.bold())
                Text(detail).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(.vertical, 6)
    }

    private var birthDateFormatter: DateFormatter {
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .none
        f.locale = Locale(identifier: "zh_CN")
        return f
    }

    private var versionString: String {
        (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String) ?? "0.1"
    }

    private var buildString: String {
        (Bundle.main.infoDictionary?["CFBundleVersion"] as? String) ?? "1"
    }

    // MARK: - Actions

    @MainActor
    private func refreshAll() async {
        refreshPermissions()
        await refreshCounts()
    }

    @MainActor
    private func refreshPermissions() {
        micGranted = AVAudioApplication.shared.recordPermission == .granted
        speechStatus = SFSpeechRecognizer.authorizationStatus()
    }

    @MainActor
    private func refreshCounts() async {
        let memDesc = FetchDescriptor<MemoryRecord>()
        let taskDesc = FetchDescriptor<AgentTaskRecord>()
        memoryCount = (try? modelContext.fetchCount(memDesc)) ?? 0
        taskCount = (try? modelContext.fetchCount(taskDesc)) ?? 0
    }

    @MainActor
    private func requestVoicePermission() {
        guard !requestingVoice else { return }
        requestingVoice = true
        Task { @MainActor in
            if let voice = center.voiceService {
                let result = await voice.requestAuthorization()
                applyVoiceAuth(result)
            } else {
                // Voice service not attached yet — request mic directly,
                // SFSpeechRecognizer will prompt via its own alert.
                let granted = await AVAudioApplication.requestRecordPermission()
                applyVoiceAuth(granted ? .granted : .denied)
            }
            requestingVoice = false
        }
    }

    @MainActor
    private func applyVoiceAuth(_ auth: VoiceAuthorization) {
        refreshPermissions()
        switch auth {
        case .granted:
            showToast("语音权限已授权")
        case .denied:
            showToast("请到系统设置开启权限")
        case .restricted:
            showToast("本机不允许使用语音")
        case .notDetermined:
            break
        }
    }

    private func openSystemSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
    }

    @MainActor
    private func resetEverything() {
        do {
            try modelContext.delete(model: MemoryRecord.self)
            try modelContext.delete(model: AgentTaskRecord.self)
            try modelContext.save()
            memoryCount = 0
            taskCount = 0
            showToast("已清空")
        } catch {
            showToast("清空失败：\(error.localizedDescription)")
        }
    }

    @MainActor
    private func showToast(_ text: String) {
        toastText = text
        withAnimation { toastShown = true }
        Task {
            try? await Task.sleep(for: .seconds(1.9))
            withAnimation { toastShown = false }
        }
    }
}

#Preview {
    NavigationStack {
        SettingsView()
    }
    .environment(OLOCenter())
    .modelContainer(OLOModelContainer.make(inMemory: true))
}
