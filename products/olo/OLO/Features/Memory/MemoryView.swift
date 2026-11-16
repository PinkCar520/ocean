import SwiftUI

/// Long-term memory browser. Users can view and delete memory (Spec §56).
/// Phase 2 is a placeholder; Phase 8 lists real `MemoryItem`s here.
struct MemoryView: View {
    var body: some View {
        PlaceholderPage(
            eyebrow: "Memory",
            title: "它认识你。",
            detail: "记忆属于你的 OLO Identity，而不是某台硬件。Phase 8 在这里读写长期记忆。",
            stateLabel: nil
        )
    }
}
