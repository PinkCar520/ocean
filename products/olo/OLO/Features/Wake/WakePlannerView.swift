import SwiftUI

struct WakePlannerView: View {
    @Environment(OLOCenter.self) private var center
    @Environment(\.scenePhase) private var scenePhase
    private var planner: WakePlannerController { center.wakePlanner }
    let autoLoadCommitment: Bool

    init(autoLoadCommitment: Bool = false) {
        self.autoLoadCommitment = autoLoadCommitment
    }

    var body: some View {
        @Bindable var planner = planner
        Form {
            Section {
                Text("OLO 读取未来七天的第一项非全天日程，生成可检查的起床计划。只有你确认后，才会创建系统闹钟。")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Button("读取下一项日程") {
                    Task { await planner.loadCommitment() }
                }
                .disabled(planner.status == .loading || planner.status == .scheduling || planner.hasActiveAlarm)
            }

            if let commitment = planner.commitment, let plan = planner.plan {
                Section("下一项安排") {
                    Text(commitment.title).font(.headline)
                    LabeledContent("开始", value: commitment.startDate.formatted(date: .abbreviated, time: .shortened))
                    if let location = commitment.location, !location.isEmpty {
                        LabeledContent("地点", value: location)
                    }
                }
                Section("计划依据") {
                    Stepper("晨间准备：\(planner.preparationMinutes) 分钟", value: $planner.preparationMinutes, in: 0...240, step: 5)
                    Stepper("通勤：\(planner.travelMinutes) 分钟", value: $planner.travelMinutes, in: 0...360, step: 5)
                    LabeledContent("到达缓冲", value: "10 分钟")
                    LabeledContent("最晚离家", value: plan.departureDate.formatted(date: .omitted, time: .shortened))
                }
                .disabled(planner.hasActiveAlarm)
                Section("起床计划") {
                    Text(plan.wakeDate.formatted(date: .abbreviated, time: .shortened))
                        .font(.largeTitle.bold())
                    if planner.hasActiveAlarm {
                        Button("我醒了") { Task { await planner.confirmAwake() } }
                            .buttonStyle(.borderedProminent)
                        Button("取消这个闹钟", role: .destructive) {
                            Task { await planner.cancelAlarm() }
                        }
                    } else {
                        Button("确认并创建系统闹钟") {
                            Task { await planner.schedule() }
                        }
                        .disabled(plan.wakeDate <= .now || planner.status == .scheduling)
                    }
                }
            }

            statusSection(planner)
        }
        .navigationTitle("起床计划")
        .task {
            await planner.restore()
            if autoLoadCommitment, planner.commitment == nil, !planner.hasActiveAlarm {
                await planner.loadCommitment()
            }
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            Task { try? await planner.refreshAlarmState() }
        }
    }

    @ViewBuilder
    private func statusSection(_ planner: WakePlannerController) -> some View {
        switch planner.status {
        case .loading:
            Section { ProgressView("正在读取日程…") }
        case .scheduling:
            Section { ProgressView("正在创建并核验闹钟…") }
        case .cancelling:
            Section { ProgressView("正在取消并核验…") }
        case .scheduled:
            Section { Label("系统闹钟已创建并核验", systemImage: "checkmark.circle.fill").foregroundStyle(.green) }
        case .alerting:
            Section { Label("起床闹钟正在响", systemImage: "alarm.waves.left.and.right.fill").foregroundStyle(.orange) }
        case .stopped:
            Section("等待确认") {
                Text("你停止了闹钟。停止闹钟不等于已经醒来。")
                Button("我醒了") { Task { await planner.confirmAwake() } }
                    .buttonStyle(.borderedProminent)
            }
        case .awakeConfirmed:
            Section {
                Label("已确认醒来，SR-001 完成", systemImage: "sun.max.fill").foregroundStyle(.green)
                Button("开始新的起床计划") { Task { await planner.resetCompletedPlan() } }
            }
        case .failed(let message):
            Section("需要处理") { Text(message).foregroundStyle(.red) }
        default:
            EmptyView()
        }
    }
}
