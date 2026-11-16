import SwiftUI
import SwiftData

/// History of agent actions / tool executions. Phase 2 is a placeholder;
/// Phase 7 surfaces real `ToolExecution` records here.
struct ActionsView: View {
    @Environment(OLOCenter.self) private var center
    @Query(sort: \AgentTaskRecord.updatedAt, order: .reverse) private var records: [AgentTaskRecord]
    @State private var receipts: [OLOLocalActionReceipt] = []

    var body: some View {
        List {
            controlPlaneSection

            if receipts.isEmpty, records.isEmpty {
                ContentUnavailableView("还没有执行记录", systemImage: "checkmark.circle", description: Text("OLO 完成或尝试的任务会保存在这里。"))
            }

            if !receipts.isEmpty {
                Section("Action Receipts") {
                    ForEach(receipts) { receipt in
                        NavigationLink {
                            ActionReceiptDetailView(receipt: receipt)
                        } label: {
                            receiptRow(receipt)
                        }
                    }
                }
            }

            if !records.isEmpty {
                Section("Agent Tasks") {
                    ForEach(records) { record in
                        let task = record.toModel
                        HStack(spacing: 12) {
                            Image(systemName: task.status == .completed ? "checkmark.circle.fill" : "xmark.circle.fill")
                                .foregroundStyle(task.status == .completed ? .green : .red)
                            VStack(alignment: .leading, spacing: 4) {
                                Text(task.rawIntent).font(.headline)
                                Text(task.summary).font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text(task.updatedAt, style: .time).font(.caption2).foregroundStyle(.tertiary)
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
        }
        .navigationTitle("Actions")
        .task { await refreshReceipts() }
        .refreshable {
            await center.controlPlaneSync?.retryPending()
            await refreshReceipts()
        }
    }

    @ViewBuilder
    private var controlPlaneSection: some View {
        let status = center.controlPlaneStatus
        Section("Control Plane") {
            if let endpoint = status.endpoint {
                LabeledContent("Endpoint", value: endpoint.host() ?? endpoint.absoluteString)
                LabeledContent("待同步", value: "\(status.pendingCount)")
                if let lastSyncedAt = status.lastSyncedAt {
                    LabeledContent("最近同步", value: lastSyncedAt.formatted(date: .omitted, time: .standard))
                }
                if let error = status.lastError {
                    Text(error).font(.caption).foregroundStyle(.orange)
                }
                Button("立即重试") {
                    Task {
                        await center.controlPlaneSync?.retryPending()
                        await refreshReceipts()
                    }
                }
                .disabled(status.pendingCount == 0)
            } else {
                Label("仅本地执行记录", systemImage: "iphone")
                Text("未配置 OLO_CONTROL_PLANE_URL；Apple 本地能力和 Receipt 仍可使用。")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func receiptRow(_ receipt: OLOLocalActionReceipt) -> some View {
        HStack(spacing: 12) {
            Image(systemName: receipt.status == "verified" ? "checkmark.seal.fill" : "clock.badge.exclamationmark")
                .foregroundStyle(receipt.status == "verified" ? .green : .orange)
            VStack(alignment: .leading, spacing: 4) {
                Text(receipt.intent).font(.headline)
                Text(receipt.summary).font(.caption).foregroundStyle(.secondary).lineLimit(2)
            }
            Spacer()
            Text(receipt.status).font(.caption2).foregroundStyle(.tertiary)
        }
        .padding(.vertical, 4)
    }

    private func refreshReceipts() async {
        receipts = await center.actionReceiptLedger.all()
    }
}

private struct ActionReceiptDetailView: View {
    let receipt: OLOLocalActionReceipt

    var body: some View {
        Form {
            Section("Outcome") {
                LabeledContent("Status", value: receipt.status)
                Text(receipt.summary)
                LabeledContent("Updated", value: receipt.updatedAt.formatted())
            }
            Section("Authority") {
                LabeledContent("Capability", value: receipt.capability)
                LabeledContent("Action", value: receipt.actionID)
                LabeledContent("Request", value: receipt.requestID)
            }
            if !receipt.evidence.isEmpty {
                Section("Verification Evidence") {
                    ForEach(receipt.evidence.keys.sorted(), id: \.self) { key in
                        LabeledContent(key, value: receipt.evidence[key] ?? "")
                    }
                }
            }
        }
        .navigationTitle("Action Receipt")
        .navigationBarTitleDisplayMode(.inline)
    }
}
