import SwiftUI

/// Native typed-intent presentation used when voice input isn't available
/// or when a fresh long-press Agent request needs text input.
struct TextInputSheet: View {
    @Binding var text: String
    let onSubmit: () -> Void

    @Environment(\.dismiss) private var dismiss
    @FocusState private var fieldFocused: Bool

    private var isEmpty: Bool {
        text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("说点什么…", text: $text, axis: .vertical)
                        .focused($fieldFocused)
                        .lineLimit(2...5)
                        .submitLabel(.send)
                        .onSubmit(submit)
                } header: {
                    Text("告诉 OLO 你的目标")
                } footer: {
                    Text("例如：“明天九点提醒我开会”。OLO 会先展示理解结果，再由你确认实际操作。")
                }
            }
            .navigationTitle("新请求")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(role: .cancel) {
                        dismiss()
                    } label: {
                        Label("取消", systemImage: "xmark")
                    }
                    .labelStyle(.iconOnly)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(action: submit) {
                        Label("发送", systemImage: "arrow.up")
                    }
                    .labelStyle(.iconOnly)
                    .buttonStyle(.borderedProminent)
                    .disabled(isEmpty)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .onAppear { fieldFocused = true }
    }

    private func submit() {
        guard !isEmpty else { return }
        onSubmit()
    }
}

#Preview {
    TextInputSheet(text: .constant(""), onSubmit: {})
}
