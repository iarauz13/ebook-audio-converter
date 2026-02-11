/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = config => ({
  type: "widget",
  icon: "../assets/icon.png",
  entitlements: {
    "com.apple.security.application-groups": ["group.com.audiobooks.shared"],
  },
  frameworks: ["SwiftUI", "WidgetKit"],
});