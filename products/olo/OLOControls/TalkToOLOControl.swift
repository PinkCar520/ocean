import AppIntents
import WidgetKit
import SwiftUI

/// A Control Center / Lock Screen / Action Button entry for OLO.
struct TalkToOLOControl: ControlWidget {
    static let kind = "app.olo.OLO.talk"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: TalkToOLOIntent()) {
                Label("Talk to OLO", systemImage: "waveform")
            }
        }
        .displayName("Talk to OLO")
        .description("Open OLO and start a voice conversation.")
    }
}

@main
struct OLOControlsBundle: WidgetBundle {
    var body: some Widget {
        TalkToOLOControl()
    }
}
