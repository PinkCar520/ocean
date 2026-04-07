import SwiftUI

extension Color {
    static let uclawBackground = Color(red: 0.965, green: 0.953, blue: 0.949) // #f6f3f2
    static let uclawAccent = Color(red: 0.925, green: 0.357, blue: 0.078)   // #EC5B14
    static let uclawBorder = Color(red: 0.910, green: 0.894, blue: 0.886)   // #E8E4E2
    static let uclawSurface = Color.white
    static let uclawTextPrimary = Color(red: 0.110, green: 0.106, blue: 0.106) // #1C1B1B
    static let uclawTextSecondary = Color(red: 0.443, green: 0.420, blue: 0.404) // #716B67
}

struct UClawShadow: ViewModifier {
    func body(content: Content) -> some View {
        content
            .shadow(color: Color.black.opacity(0.03), radius: 8, x: 0, y: 4)
    }
}

extension View {
    func uclawCardStyle() -> some View {
        self
            .background(Color.uclawSurface)
            .cornerRadius(12)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.uclawBorder, lineWidth: 1)
            )
            .modifier(UClawShadow())
    }
}
