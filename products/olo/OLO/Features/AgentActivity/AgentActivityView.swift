import SwiftUI
import SwiftData

/// Shows the live reminder lifecycle and its persisted execution evidence.
struct AgentActivityView: View {
    @Environment(OLOCenter.self) private var center
    @State private var showingConfirmation = false
    @Query(sort: \AgentTaskRecord.updatedAt, order: .reverse) private var records: [AgentTaskRecord]

    var body: some View {
        NavigationStack {
            List {
                Section("执行记录") {
                    NavigationLink {
                        ActionsView()
                    } label: {
                        Label("Actions · 执行凭证与同步状态", systemImage: "checkmark.seal")
                    }
                }
                if let agent = center.agentRuntime, let task = agent.task {
                    Section("当前任务") {
                        Text(task.rawIntent)
                        Text(task.summary)
                        ForEach(task.clarifications) { turn in
                            VStack(alignment: .leading, spacing: 3) {
                                Text("OLO：\(turn.question)").font(.caption).foregroundStyle(.secondary)
                                Text("你：\(turn.answer)")
                            }
                        }
                        ForEach(task.plan) { step in
                            stepRow(step)
                        }
                        if agent.persistenceError != nil {
                            Text(agent.persistenceError ?? "").foregroundStyle(.red)
                            Button("重试保存历史") { agent.retryHistorySave() }
                        }
                        if !task.status.isTerminal || task.status == .failed {
                            Button("查看 / 补充信息") { showingConfirmation = true }
                        }
                    }
                }
                if records.isEmpty {
                    ContentUnavailableView("还没有任务", systemImage: "waveform", description: Text("创建一个提醒后，执行步骤会出现在这里。"))
                }
                ForEach(records.filter { $0.id != center.agentRuntime?.task?.id }) { record in
                    let task = record.toModel
                    Section {
                        ForEach(task.clarifications) { turn in
                            VStack(alignment: .leading, spacing: 3) {
                                Text("OLO：\(turn.question)").font(.caption).foregroundStyle(.secondary)
                                Text("你：\(turn.answer)")
                            }
                        }
                        ForEach(task.plan) { step in
                            stepRow(step)
                        }
                    } header: {
                        Text("\(task.status.label) · \(task.rawIntent)")
                    } footer: {
                        Text(task.summary)
                        if !task.status.isTerminal && task.id != center.agentRuntime?.task?.id {
                            Text("这是上次会话未结束的记录。请先检查系统提醒事项；OLO 不会自动重新执行。")
                                .foregroundStyle(.orange)
                        }
                    }
                }
            }
            .navigationTitle("Agent Activity")
            .sheet(isPresented: $showingConfirmation) {
                if let agent = center.agentRuntime { ReminderConfirmationView(agent: agent) }
            }
        }
    }

    private func stepRow(_ step: AgentStep) -> some View {
        HStack(alignment: .top) {
            Image(systemName: icon(for: step.status)).foregroundStyle(color(for: step.status))
            VStack(alignment: .leading, spacing: 3) {
                Text(step.description)
                if let result = step.resultSummary { Text(result).font(.caption).foregroundStyle(.secondary) }
            }
        }
    }

    private func icon(for status: AgentStepStatus) -> String { status == .done ? "checkmark.circle.fill" : status == .failed ? "xmark.circle.fill" : status == .running ? "arrow.trianglehead.2.clockwise.rotate.90" : "circle" }
    private func color(for status: AgentStepStatus) -> Color { status == .done ? .green : status == .failed ? .red : status == .running ? .blue : .secondary }
}
