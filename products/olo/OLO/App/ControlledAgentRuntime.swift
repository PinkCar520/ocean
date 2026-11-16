import Foundation
import Observation

/// UI-facing, capability-neutral runtime. Understanding proposes an action;
/// the registry resolves the only executable implementation, the trust policy
/// gates it, and the runtime owns execution, verification and persistence.
@MainActor @Observable
final class ControlledAgentRuntime: AgentRuntime {
    private(set) var task: AgentTask?
    private(set) var persistenceError: String?
    private(set) var interpretationSource: AgentUnderstandingSource?
    private(set) var explanation = ""
    private(set) var missingFields: Set<AgentMissingField> = []
    private(set) var selectedToolId: String?
    private(set) var permissionLevel: PermissionLevel?
    private(set) var clarificationQuestion = ""
    var title = ""
    var dueDate = Date.now

    private let understanding: any AgentUnderstanding
    private let registry: ToolRegistry
    private let trustPolicy: any TrustPolicy
    private let repository: any AgentTaskSaving
    private let controlPlaneSync: (any AgentControlPlaneSyncing)?
    private var originalRequest: AgentRequest?
    private var interpretation: AgentInterpretation?
    private var operation: Task<Void, Never>?
    private var currentActionID: String?

    init(
        understanding: any AgentUnderstanding = RuleBasedAgentUnderstanding(),
        registry: ToolRegistry,
        trustPolicy: any TrustPolicy = ValidationTrustPolicy(),
        repository: any AgentTaskSaving,
        controlPlaneSync: (any AgentControlPlaneSyncing)? = nil
    ) {
        self.understanding = understanding
        self.registry = registry
        self.trustPolicy = trustPolicy
        self.repository = repository
        self.controlPlaneSync = controlPlaneSync
    }

    var availableTools: [any Tool] { registry.all }
    var isBusy: Bool { task?.status == .executing || task?.status == .verifying }
    var isReminderRequest: Bool { selectedToolId == ReminderTool.identifier }

    var canConfirm: Bool {
        guard task?.status == .waitingForPermission else { return false }
        return selectedToolId != nil && missingFields.isEmpty
            && !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && dueDate > .now && persistenceError == nil
    }

    func canResume(_ request: AgentRequest) -> Bool {
        guard let task else { return false }
        return task.id == request.id && !task.status.isTerminal
    }

    func start(_ request: AgentRequest) {
        guard !isBusy else { return }
        guard task?.id != request.id else { return }
        if let task, !task.status.isTerminal { cancel(taskId: task.id) }
        originalRequest = request
        interpretation = nil
        task = AgentTask(id: request.id, rawIntent: request.input, status: .captured)
        title = ""
        dueDate = .now.addingTimeInterval(3600)
        interpretationSource = nil
        explanation = ""
        missingFields = []
        selectedToolId = nil
        permissionLevel = nil
        clarificationQuestion = ""
        currentActionID = nil
        if let controlPlaneSync {
            Task { await controlPlaneSync.capture(request: request) }
        }
        guard publish(.understanding, "识别意图与所需信息") else { return }
        let id = request.id
        operation = Task { await interpret(request, id: id) }
    }

    func provideInformation(_ answer: AgentRequest) {
        guard task?.status == .needsInformation,
              let previous = interpretation,
              let originalRequest,
              let clarifier = understanding as? any AgentClarifying else { return }
        task?.clarifications.append(AgentClarification(
            question: clarificationQuestion,
            answer: answer.input,
            source: answer.source
        ))
        guard publish(.understanding, "正在把补充信息合并到当前任务") else { return }
        let id = task?.id
        operation = Task {
            do {
                var result = try await clarifier.refine(
                    previous: previous,
                    originalRequest: originalRequest,
                    answer: answer,
                    now: .now,
                    timeZone: .current
                )
                try Task.checkCancellation()
                guard task?.id == id, task?.status == .understanding else { return }
                if result.title == nil { result.title = previous.title }
                if result.dueDate == nil { result.dueDate = previous.dueDate }
                if result.title?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false {
                    result.missingFields.remove(.title)
                } else {
                    result.missingFields.insert(.title)
                }
                if let date = result.dueDate, date > .now {
                    result.missingFields.remove(.time)
                } else {
                    result.missingFields.insert(.time)
                }
                apply(result, clarification: answer.input)
            } catch is CancellationError {
                guard task?.id == id else { return }
                _ = publish(.cancelled, "已取消补充信息")
            } catch {
                guard task?.id == id else { return }
                _ = publish(.needsInformation, "未能理解补充内容，请换一种说法")
            }
            operation = nil
        }
    }

    private func interpret(_ request: AgentRequest, id: UUID) async {
        do {
            let result = try await understanding.understand(request, now: .now, timeZone: .current)
            try Task.checkCancellation()
            guard task?.id == id, task?.status == .understanding else { return }
            apply(result)
        } catch is CancellationError {
            guard task?.id == id else { return }
            if task?.status != .cancelled { _ = publish(.cancelled, "已取消理解请求") }
        } catch {
            guard task?.id == id else { return }
            task?.plan = [AgentStep(type: .reason, description: "理解用户请求", resultSummary: error.localizedDescription, status: .failed)]
            _ = publish(.failed, "无法理解请求：\(error.localizedDescription)")
        }
        operation = nil
    }

    private func apply(_ result: AgentInterpretation, clarification: String? = nil) {
        interpretation = result
        interpretationSource = result.source
        explanation = result.explanation
        guard result.kind == .reminder else {
            selectedToolId = nil
            task?.plan = [
                AgentStep(type: .reason, description: "理解用户请求", resultSummary: result.explanation, status: .done),
                AgentStep(type: .response, description: "说明当前能力范围", resultSummary: "当前只支持创建系统提醒", status: .done)
            ]
            _ = publish(.failed, "当前只支持创建系统提醒")
            return
        }

        selectedToolId = ReminderTool.identifier
        guard let tool = registry.tool(named: ReminderTool.identifier) else {
            _ = publish(.failed, "ReminderTool 尚未注册")
            return
        }
        permissionLevel = tool.permissionLevel
        title = result.title ?? title
        if let date = result.dueDate { dueDate = date }
        missingFields = result.missingFields
        clarificationQuestion = question(for: missingFields)

        var reasonSummary = "\(result.source.label)：\(result.explanation)"
        if let clarification { reasonSummary += " 补充：\(clarification)" }
        task?.plan = [
            AgentStep(type: .reason, description: "理解并合并任务信息", resultSummary: reasonSummary, status: .done),
            AgentStep(type: .confirmation, description: "按 Trust Policy 核对授权", status: .pending),
            AgentStep(type: .toolCall, toolId: tool.id, description: "由 iPhone 写入系统提醒", status: .pending),
            AgentStep(type: .verification, description: "读取并核对工具结果", status: .pending)
        ]
        _ = publish(.planning, "已生成受控执行计划")
        guard missingFields.isEmpty else {
            _ = publish(.needsInformation, clarificationQuestion)
            return
        }
        switch trustPolicy.decision(for: tool.permissionLevel) {
        case .run:
            grantPermission(for: task?.id ?? UUID())
        case .confirm:
            _ = publish(.waitingForPermission, "请核对事项与时间；确认后执行")
        case .deny(let reason):
            _ = publish(.failed, reason)
        }
    }

    func updateTitle(_ value: String) {
        title = value
        if !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { missingFields.remove(.title) }
        refreshInformationState()
    }

    func updateDueDate(_ value: Date) {
        dueDate = value
        if value > .now { missingFields.remove(.time) }
        refreshInformationState()
    }

    private func refreshInformationState() {
        guard task?.status == .needsInformation || task?.status == .waitingForPermission else { return }
        clarificationQuestion = question(for: missingFields)
        if missingFields.isEmpty, let permissionLevel {
            switch trustPolicy.decision(for: permissionLevel) {
            case .confirm: _ = publish(.waitingForPermission, "请核对事项与时间；确认后执行")
            case .run: grantPermission(for: task?.id ?? UUID())
            case .deny(let reason): _ = publish(.failed, reason)
            }
        } else {
            _ = publish(.needsInformation, clarificationQuestion)
        }
    }

    private func question(for fields: Set<AgentMissingField>) -> String {
        if fields == [.time] { return "你希望几点提醒？" }
        if fields == [.title] { return "要提醒你做什么？" }
        return fields.isEmpty ? "" : "请补充提醒事项和准确时间。"
    }

    func confirm() {
        guard let id = task?.id else { return }
        grantPermission(for: id)
    }

    func grantPermission(for taskId: UUID) {
        guard canConfirm, task?.id == taskId, let toolId = selectedToolId,
              let tool = registry.tool(named: toolId) else { return }
        let arguments = ["title": title.trimmingCharacters(in: .whitespacesAndNewlines), "dueDate": dueDate.ISO8601Format()]
        task?.plan[1].status = .done
        task?.plan[1].resultSummary = "用户已确认"
        task?.plan[2].arguments = arguments
        task?.plan[2].status = .running
        task?.currentStepIndex = 2
        guard publish(.executing, "正在执行 \(tool.name)") else {
            task?.status = .failed
            task?.summary = "历史保存失败，尚未执行"
            return
        }
        let actionUUID = UUID().uuidString.lowercased()
        let actionID = "act_\(actionUUID)"
        let requestID = "request_\(actionUUID)"
        currentActionID = actionID
        if let controlPlaneSync {
            Task {
                await controlPlaneSync.startAction(
                    taskID: taskId,
                    actionID: actionID,
                    requestID: requestID,
                    toolID: tool.id,
                    arguments: arguments
                )
            }
        }
        operation = Task { await execute(tool: tool, arguments: arguments, taskId: taskId) }
    }

    private func execute(tool: any Tool, arguments: [String: String], taskId: UUID) async {
        var receipt: ToolResult?
        do {
            receipt = try await tool.execute(arguments: arguments)
            try Task.checkCancellation()
            guard task?.id == taskId, task?.status == .executing else { return }
            task?.plan[2].status = .done
            task?.plan[2].resultSummary = receipt?.summary
            task?.plan[3].status = .running
            task?.currentStepIndex = 3
            _ = publish(.verifying, "执行完成，正在核对结果")
            if let verifiable = tool as? any VerifiableTool, let receipt {
                try await verifiable.verify(result: receipt, arguments: arguments)
            }
            task?.plan[3].status = .done
            task?.plan[3].resultSummary = "已通过工具读回验证"
            syncSuccessfulAction(receipt)
            if !publish(.completed, "已创建：\(title) · \(dueDate.formatted())") {
                task?.status = .partial
                task?.summary = "操作已执行并核实，但历史保存失败；请勿重复执行"
            }
        } catch is CancellationError {
            guard task?.id == taskId else { return }
            syncRejectedAction(summary: "Local execution was cancelled before completion")
            if task?.status != .cancelled { _ = publish(.cancelled, "已取消，未执行") }
        } catch {
            guard task?.id == taskId else { return }
            if let receipt {
                syncUnverifiedAction(receipt, summary: error.localizedDescription)
            } else {
                syncRejectedAction(summary: error.localizedDescription)
            }
            let index = receipt == nil ? 2 : 3
            task?.plan[index].status = .failed
            task?.plan[index].resultSummary = error.localizedDescription
            _ = publish(receipt == nil ? .failed : .partial, error.localizedDescription + (receipt == nil ? "" : "；操作可能已生效，请先检查结果，勿重复执行"))
        }
        operation = nil
    }

    func cancel(taskId: UUID) {
        guard task?.id == taskId, let status = task?.status, !status.isTerminal, status != .verifying else { return }
        operation?.cancel()
        _ = publish(.cancelled, "已取消，未执行")
    }

    func cancel() {
        guard let id = task?.id else { return }
        cancel(taskId: id)
    }

    func retryHistorySave() {
        guard let task else { return }
        do { try repository.save(task); persistenceError = nil }
        catch { persistenceError = error.localizedDescription }
    }

    func retry() {
        guard task?.status == .failed, selectedToolId != nil else { return }
        currentActionID = nil
        _ = publish(.waitingForPermission, "请重新核对并确认；如权限被拒绝，请先在系统设置中开启")
    }

    private func syncSuccessfulAction(_ receipt: ToolResult?) {
        guard let controlPlaneSync, let actionID = currentActionID, let receipt else { return }
        let providerRef = receipt.payload["identifier"]
        Task {
            await controlPlaneSync.updateAction(
                actionID: actionID,
                status: "accepted",
                providerRef: providerRef,
                evidence: [:],
                summary: receipt.summary
            )
            await controlPlaneSync.updateAction(
                actionID: actionID,
                status: "completed",
                providerRef: providerRef,
                evidence: [:],
                summary: receipt.summary
            )
            await controlPlaneSync.updateAction(
                actionID: actionID,
                status: "verified",
                providerRef: providerRef,
                evidence: receipt.payload,
                summary: "Verified by the iPhone tool read-back"
            )
        }
    }

    private func syncUnverifiedAction(_ receipt: ToolResult, summary: String) {
        guard let controlPlaneSync, let actionID = currentActionID else { return }
        let providerRef = receipt.payload["identifier"]
        Task {
            await controlPlaneSync.updateAction(
                actionID: actionID,
                status: "accepted",
                providerRef: providerRef,
                evidence: [:],
                summary: receipt.summary
            )
            await controlPlaneSync.updateAction(
                actionID: actionID,
                status: "completed",
                providerRef: providerRef,
                evidence: [:],
                summary: receipt.summary
            )
            await controlPlaneSync.updateAction(
                actionID: actionID,
                status: "outcome_unknown",
                providerRef: providerRef,
                evidence: receipt.payload,
                summary: summary
            )
        }
    }

    private func syncRejectedAction(summary: String) {
        guard let controlPlaneSync, let actionID = currentActionID else { return }
        Task {
            await controlPlaneSync.updateAction(
                actionID: actionID,
                status: "rejected",
                providerRef: nil,
                evidence: [:],
                summary: summary
            )
        }
    }

    @discardableResult
    private func publish(_ status: AgentTaskStatus, _ summary: String) -> Bool {
        task?.status = status
        task?.summary = summary
        task?.updatedAt = .now
        guard let task else { return false }
        do {
            try repository.save(task)
            persistenceError = nil
            return true
        } catch {
            persistenceError = "任务历史保存失败：\(error.localizedDescription)"
            return false
        }
    }
}
