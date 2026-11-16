import SwiftUI

/// A lightweight transient message, used for short agent acknowledgements
/// ("好，我记住了。"). Toasts avoid the chat-bubble feel OLO rejects.
struct OLOToast: View {
    let text: String
    @Binding var isShown: Bool

    var body: some View {
        Text(text)
            .font(.caption)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .padding(.horizontal, 14)
            .background(.black, in: RoundedRectangle(cornerRadius: 16))
            .foregroundStyle(.white)
            .opacity(isShown ? 1 : 0)
            .offset(y: isShown ? 0 : -10)
            .animation(.easeOut(duration: 0.25), value: isShown)
    }
}
