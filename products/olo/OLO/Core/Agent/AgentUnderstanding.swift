import Foundation

enum AgentIntentKind: String, Sendable, Codable {
    case reminder
    case unsupported
}

enum AgentMissingField: String, Sendable, Codable, Hashable {
    case title
    case time
}

enum AgentUnderstandingSource: String, Sendable, Codable {
    case onDeviceModel
    case ruleFallback

    var label: String {
        switch self {
        case .onDeviceModel: "设备端模型"
        case .ruleFallback: "基础规则"
        }
    }
}

struct AgentInterpretation: Sendable, Equatable {
    var kind: AgentIntentKind
    var title: String?
    var dueDate: Date?
    var missingFields: Set<AgentMissingField>
    var explanation: String
    var source: AgentUnderstandingSource
}

protocol AgentUnderstanding: Sendable {
    func understand(_ request: AgentRequest, now: Date, timeZone: TimeZone) async throws -> AgentInterpretation
}

protocol AgentClarifying: Sendable {
    func refine(
        previous: AgentInterpretation,
        originalRequest: AgentRequest,
        answer: AgentRequest,
        now: Date,
        timeZone: TimeZone
    ) async throws -> AgentInterpretation
}

enum AgentUnderstandingError: LocalizedError, Sendable {
    case modelUnavailable(String)
    case timedOut
    case invalidOutput

    var errorDescription: String? {
        switch self {
        case .modelUnavailable(let reason): "设备端模型不可用：\(reason)"
        case .timedOut: "理解请求超时"
        case .invalidOutput: "模型返回了无法验证的结果"
        }
    }
}

struct RuleBasedAgentUnderstanding: AgentUnderstanding, AgentClarifying {
    func understand(_ request: AgentRequest, now: Date, timeZone: TimeZone) async throws -> AgentInterpretation {
        var calendar = Calendar.current
        calendar.timeZone = timeZone
        if let reminder = ReminderIntent.parse(request.input, now: now, calendar: calendar) {
            return AgentInterpretation(
                kind: .reminder,
                title: reminder.title,
                dueDate: reminder.dueDate,
                missingFields: [],
                explanation: "识别到明确的提醒事项和未来时间。",
                source: .ruleFallback
            )
        }
        guard request.input.contains("提醒") else {
            return AgentInterpretation(
                kind: .unsupported,
                title: nil,
                dueDate: nil,
                missingFields: [],
                explanation: "当前只开放创建系统提醒这一项能力。",
                source: .ruleFallback
            )
        }
        var title = request.input
        for token in ["提醒我", "提醒", "今天", "明天", "后天", "上午", "中午", "下午", "晚上", "凌晨"] {
            title = title.replacingOccurrences(of: token, with: "")
        }
        title = title.trimmingCharacters(in: .whitespacesAndNewlines.union(.punctuationCharacters))
        var missing: Set<AgentMissingField> = [.time]
        if title.isEmpty { missing.insert(.title) }
        return AgentInterpretation(
            kind: .reminder,
            title: title.isEmpty ? nil : title,
            dueDate: nil,
            missingFields: missing,
            explanation: "识别到提醒意图，但缺少可执行的明确时间。",
            source: .ruleFallback
        )
    }


    func refine(
        previous: AgentInterpretation,
        originalRequest: AgentRequest,
        answer: AgentRequest,
        now: Date,
        timeZone: TimeZone
    ) async throws -> AgentInterpretation {
        guard previous.kind == .reminder else { return previous }
        var calendar = Calendar.current
        calendar.timeZone = timeZone
        var result = previous
        let trimmed = answer.input.trimmingCharacters(in: .whitespacesAndNewlines)
        if previous.missingFields.contains(.time),
           let date = ReminderIntent.parseClarifiedTime(trimmed, originalInput: originalRequest.input, now: now, calendar: calendar) {
            result.dueDate = date
            result.missingFields.remove(.time)
        }
        if previous.missingFields.contains(.title), !trimmed.isEmpty,
           result.missingFields.contains(.time) == false || result.dueDate == nil {
            result.title = trimmed
            result.missingFields.remove(.title)
        }
        result.explanation = result.missingFields.isEmpty
            ? "已把补充信息合并到原任务。"
            : "已收到补充信息，但仍缺少可执行的准确内容。"
        result.source = .ruleFallback
        return result
    }
}

struct ResilientAgentUnderstanding: AgentUnderstanding, AgentClarifying {
    let primary: any AgentUnderstanding
    let fallback: any AgentUnderstanding

    func understand(_ request: AgentRequest, now: Date, timeZone: TimeZone) async throws -> AgentInterpretation {
        do {
            return try await primary.understand(request, now: now, timeZone: timeZone)
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            var result = try await fallback.understand(request, now: now, timeZone: timeZone)
            result.explanation += " 设备端模型本次未完成，已使用基础规则。"
            return result
        }
    }


    func refine(
        previous: AgentInterpretation,
        originalRequest: AgentRequest,
        answer: AgentRequest,
        now: Date,
        timeZone: TimeZone
    ) async throws -> AgentInterpretation {
        do {
            if let primary = primary as? any AgentClarifying {
                return try await primary.refine(
                    previous: previous,
                    originalRequest: originalRequest,
                    answer: answer,
                    now: now,
                    timeZone: timeZone
                )
            }
            throw AgentUnderstandingError.modelUnavailable("不支持多轮补充")
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            guard let fallback = fallback as? any AgentClarifying else { throw error }
            var result = try await fallback.refine(
                previous: previous,
                originalRequest: originalRequest,
                answer: answer,
                now: now,
                timeZone: timeZone
            )
            result.explanation += " 设备端模型本次未完成，已使用基础规则。"
            return result
        }
    }
}

struct TimedAgentUnderstanding: AgentUnderstanding, AgentClarifying {
    let base: any AgentUnderstanding
    var timeout: Duration = .seconds(15)

    func understand(_ request: AgentRequest, now: Date, timeZone: TimeZone) async throws -> AgentInterpretation {
        try await withThrowingTaskGroup(of: AgentInterpretation.self) { group in
            group.addTask {
                try await base.understand(request, now: now, timeZone: timeZone)
            }
            group.addTask {
                try await Task.sleep(for: timeout)
                throw AgentUnderstandingError.timedOut
            }
            defer { group.cancelAll() }
            guard let first = try await group.next() else { throw CancellationError() }
            return first
        }
    }


    func refine(
        previous: AgentInterpretation,
        originalRequest: AgentRequest,
        answer: AgentRequest,
        now: Date,
        timeZone: TimeZone
    ) async throws -> AgentInterpretation {
        guard let clarifier = base as? any AgentClarifying else {
            throw AgentUnderstandingError.modelUnavailable("不支持多轮补充")
        }
        return try await withThrowingTaskGroup(of: AgentInterpretation.self) { group in
            group.addTask {
                try await clarifier.refine(previous: previous, originalRequest: originalRequest, answer: answer, now: now, timeZone: timeZone)
            }
            group.addTask {
                try await Task.sleep(for: timeout)
                throw AgentUnderstandingError.timedOut
            }
            defer { group.cancelAll() }
            guard let first = try await group.next() else { throw CancellationError() }
            return first
        }
    }
}
