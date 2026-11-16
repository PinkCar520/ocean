import SwiftUI

struct ReminderConfirmationView: View {
    @Bindable var agent: ControlledAgentRuntime
    @Environment(OLOCenter.self) private var center
    @Environment(\.dismiss) private var dismiss
    @State private var clarification = ""
    @State private var voiceTranscript = ""
    @State private var voiceError: String?
    @State private var isListeningForClarification = false
    @State private var voiceTask: Task<Void, Never>?

    var body: some View {
        NavigationStack {
            Form {
                Section("原始请求") { Text(agent.task?.rawIntent ?? "") }
                if agent.task?.status == .understanding || agent.task?.status == .planning {
                    Section {
                        ProgressView("正在使用 Agent 理解请求")
                    }
                }
                if !agent.explanation.isEmpty {
                    Section("OLO 的理解") {
                        Text(agent.explanation)
                        if let source = agent.interpretationSource {
                            LabeledContent("来源", value: source.label)
                        }
                        if let permission = agent.permissionLevel {
                            LabeledContent("授权策略", value: permission == .execute ? "L2 · Confirm" : permission.rawValue)
                        }
                    }
                }
                if agent.isReminderRequest {
                    if agent.task?.status == .needsInformation {
                        Section("OLO 需要确认") {
                            Text(agent.clarificationQuestion)
                            TextField("例如：三点半", text: $clarification)
                                .submitLabel(.send)
                                .onSubmit(submitClarification)
                            HStack {
                                Button("发送补充信息", action: submitClarification)
                                    .disabled(clarification.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isListeningForClarification)
                                Spacer()
                                Button(action: toggleClarificationVoice) {
                                    Label(isListeningForClarification ? "停止聆听" : "语音回答", systemImage: isListeningForClarification ? "stop.fill" : "mic.fill")
                                }
                                .buttonStyle(.borderedProminent)
                            }
                            if isListeningForClarification {
                                Label(voiceTranscript.isEmpty ? "正在听…" : "“\(voiceTranscript)”", systemImage: "waveform")
                                    .foregroundStyle(.secondary)
                            }
                            if let voiceError {
                                Label(voiceError, systemImage: "exclamationmark.circle")
                                    .foregroundStyle(.orange)
                            }
                        }
                    }
                    Section("创建系统提醒") {
                        TextField("提醒事项", text: Binding(
                            get: { agent.title },
                            set: { agent.updateTitle($0) }
                        ))
                        DatePicker(
                            "提醒时间",
                            selection: Binding(
                                get: { agent.dueDate },
                                set: { agent.updateDueDate($0) }
                            ),
                            in: Date.now...,
                            displayedComponents: [.date, .hourAndMinute]
                        )
                        if !agent.missingFields.isEmpty {
                            Label(agent.task?.summary ?? "请补充信息", systemImage: "questionmark.circle")
                                .foregroundStyle(.orange)
                        }
                    }
                    .disabled(agent.isBusy || agent.task?.status.isTerminal == true)
                }
                if let plan = agent.task?.plan, !plan.isEmpty {
                    Section("Agent Plan") {
                        ForEach(plan) { step in
                            Label(step.description, systemImage: icon(for: step.status))
                                .foregroundStyle(color(for: step.status))
                        }
                    }
                }
                Section {
                    Text(agent.task?.summary ?? "")
                    Text("由 iPhone 的系统提醒事项执行，并添加到时闹钟。通知能否显示取决于系统提醒事项的通知设置。")
                        .font(.footnote).foregroundStyle(.secondary)
                    if let error = agent.persistenceError {
                        Text(error).foregroundStyle(.red)
                        Button("重试保存历史") { agent.retryHistorySave() }
                    }
                }
                if agent.task?.status == .failed && agent.isReminderRequest {
                    Button("重新核对并重试") { agent.retry() }
                }
                if agent.isBusy {
                    ProgressView("正在处理")
                }
            }
            .navigationTitle("核对提醒")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(role: .cancel) {
                        if agent.task?.status.isTerminal != true {
                            agent.cancel()
                        }
                        dismiss()
                    } label: {
                        Label(agent.task?.status.isTerminal == true ? "关闭" : "取消", systemImage: "xmark")
                    }
                    .labelStyle(.iconOnly)
                    .disabled(agent.isBusy)
                }
                ToolbarItem(placement: .confirmationAction) {
                    if agent.canConfirm {
                        Button {
                            agent.confirm()
                            dismiss()
                        } label: {
                            Label("确认", systemImage: "checkmark")
                        }
                        .labelStyle(.iconOnly)
                        .buttonStyle(.borderedProminent)
                    }
                }
            }
            .interactiveDismissDisabled(agent.isBusy)
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .onDisappear {
            voiceTask?.cancel()
            voiceTask = nil
            Task { await center.voiceService?.stop() }
        }
    }

    private func submitClarification() {
        let answer = clarification.trimmingCharacters(in: .whitespacesAndNewlines)
        submitClarification(answer, source: .text)
    }

    private func submitClarification(_ answer: String, source: InputSource) {
        guard !answer.isEmpty, let task = agent.task, task.status == .needsInformation else { return }
        clarification = ""
        voiceTranscript = ""
        voiceError = nil
        agent.provideInformation(AgentRequest(
            id: task.id,
            input: answer,
            source: source,
            context: ContextSnapshot()
        ))
    }

    private func toggleClarificationVoice() {
        if isListeningForClarification {
            voiceTask?.cancel()
            voiceTask = nil
            isListeningForClarification = false
            Task { await center.voiceService?.stop() }
            return
        }
        guard let voice = center.voiceService else {
            voiceError = "语音服务尚未就绪，可以继续输入文字"
            return
        }
        voiceError = nil
        voiceTranscript = ""
        isListeningForClarification = true
        voiceTask = Task {
            defer {
                isListeningForClarification = false
                voiceTask = nil
            }
            do {
                let stream = try await voice.start()
                var partial = ""
                for try await transcript in stream {
                    try Task.checkCancellation()
                    partial = transcript.text
                    voiceTranscript = partial
                    if transcript.isFinal { break }
                }
                await voice.stop()
                try Task.checkCancellation()
                let answer = partial.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !answer.isEmpty else {
                    voiceError = "没听清，请再说一次"
                    return
                }
                submitClarification(answer, source: .voice)
            } catch is CancellationError {
                await voice.stop()
            } catch VoiceError.unauthorized {
                voiceError = "需要麦克风和语音识别权限，也可以继续输入文字"
            } catch VoiceError.timeout {
                voiceError = "聆听超时，请再试一次"
            } catch VoiceError.unavailable(let message), VoiceError.audioEngineFailed(let message), VoiceError.recognitionFailed(let message) {
                voiceError = message
            } catch {
                voiceError = "没有听清，任务仍在等待你的回答"
            }
        }
    }

    private func icon(for status: AgentStepStatus) -> String {
        switch status {
        case .done: "checkmark.circle.fill"
        case .running: "arrow.trianglehead.2.clockwise.rotate.90"
        case .failed: "xmark.circle.fill"
        case .pending, .skipped: "circle"
        }
    }

    private func color(for status: AgentStepStatus) -> Color {
        switch status {
        case .done: .green
        case .running: .blue
        case .failed: .red
        case .pending, .skipped: .secondary
        }
    }
}
