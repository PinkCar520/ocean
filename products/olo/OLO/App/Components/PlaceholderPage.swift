import SwiftUI

/// A consistent placeholder body for Phase 2 pages whose real content
/// arrives in later phases. Keeps the app navigable without fabricating
/// features prematurely.
struct PlaceholderPage: View {
    let eyebrow: String
    let title: String
    let detail: String
    var stateLabel: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(eyebrow.uppercased())
                .font(.caption2).tracking(1.4).foregroundStyle(.secondary)
            Text(title)
                .font(.largeTitle.bold()).kerning(-1.2)
            Text(detail)
                .font(.footnote).foregroundStyle(.secondary)
            if let stateLabel {
                Label(stateLabel, systemImage: "circle.fill")
                    .font(.caption)
                    .padding(.top, 6)
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(24)
        .background(Color(white: 0.95).gradient)
    }
}
