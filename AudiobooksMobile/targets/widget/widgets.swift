import WidgetKit
import SwiftUI

// MARK: - Data Model

struct StreakData {
    let currentStreak: Int
    let lastLoginDate: String
    let hasListenedToday: Bool
    let lastBookTitle: String
    let lastBookAuthor: String
    let currentChapter: Int
    let totalChapters: Int
    let totalListeningMinutes: Int
    let booksCompleted: Int
    let echoState: String
    
    static let empty = StreakData(
        currentStreak: 0,
        lastLoginDate: "",
        hasListenedToday: false,
        lastBookTitle: "",
        lastBookAuthor: "",
        currentChapter: 0,
        totalChapters: 0,
        totalListeningMinutes: 0,
        booksCompleted: 0,
        echoState: "neutral"
    )
    
    static func fromUserDefaults() -> StreakData {
        guard let defaults = UserDefaults(suiteName: "group.com.audiobooks.shared") else {
            return .empty
        }
        return StreakData(
            currentStreak: defaults.integer(forKey: "currentStreak"),
            lastLoginDate: defaults.string(forKey: "lastLoginDate") ?? "",
            hasListenedToday: defaults.bool(forKey: "hasListenedToday"),
            lastBookTitle: defaults.string(forKey: "lastBookTitle") ?? "",
            lastBookAuthor: defaults.string(forKey: "lastBookAuthor") ?? "",
            currentChapter: defaults.integer(forKey: "currentChapter"),
            totalChapters: defaults.integer(forKey: "totalChapters"),
            totalListeningMinutes: defaults.integer(forKey: "totalListeningMinutes"),
            booksCompleted: defaults.integer(forKey: "booksCompleted"),
            echoState: defaults.string(forKey: "echoState") ?? "neutral"
        )
    }
    
    var isNewUser: Bool {
        lastLoginDate.isEmpty && currentStreak == 0
    }
    
    var hasActiveBook: Bool {
        !lastBookTitle.isEmpty
    }
    
    var formattedListeningTime: String {
        let hours = totalListeningMinutes / 60
        let mins = totalListeningMinutes % 60
        if hours > 0 {
            return "\(hours)h \(mins)m"
        }
        return "\(mins)m"
    }
    
    var echoImageName: String {
        if isNewUser { return "EchoWaving" }
        if !hasListenedToday && currentStreak > 0 { return "EchoWorried" }
        if currentStreak == 0 { return "EchoSad" }
        if !hasActiveBook { return "EchoCelebrating" }
        return "EchoReading"
    }
}

// MARK: - Color Palette

extension Color {
    static let oliveGreen = Color(red: 0x9E/255, green: 0xB2/255, blue: 0x3B/255)    // #9EB23B
    static let lightOlive = Color(red: 0xC7/255, green: 0xD3/255, blue: 0x6F/255)     // #C7D36F
    static let creamYellow = Color(red: 0xFC/255, green: 0xF9/255, blue: 0xC6/255)    // #FCF9C6
    static let warmCream = Color(red: 0xEE/255, green: 0xEC/255, blue: 0xDB/255)      // #EEECDB
    static let burgundy = Color(red: 0xA8/255, green: 0x48/255, blue: 0x55/255)       // #A84855
}

// MARK: - Timeline Provider

struct StreakProvider: TimelineProvider {
    func placeholder(in context: Context) -> StreakEntry {
        StreakEntry(date: Date(), data: StreakData(
            currentStreak: 5,
            lastLoginDate: "2026-02-11",
            hasListenedToday: true,
            lastBookTitle: "The Secret History",
            lastBookAuthor: "Donna Tartt",
            currentChapter: 3,
            totalChapters: 12,
            totalListeningMinutes: 154,
            booksCompleted: 3,
            echoState: "happy"
        ))
    }
    
    func getSnapshot(in context: Context, completion: @escaping (StreakEntry) -> Void) {
        let data = StreakData.fromUserDefaults()
        completion(StreakEntry(date: Date(), data: data))
    }
    
    func getTimeline(in context: Context, completion: @escaping (Timeline<StreakEntry>) -> Void) {
        let data = StreakData.fromUserDefaults()
        let entry = StreakEntry(date: Date(), data: data)
        
        // Refresh every 15 minutes
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 15, to: Date())!
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        completion(timeline)
    }
}

struct StreakEntry: TimelineEntry {
    let date: Date
    let data: StreakData
}

// MARK: - Small Widget View

struct SmallStreakView: View {
    let data: StreakData
    
    var body: some View {
        ZStack {
            // Gradient background
            LinearGradient(
                gradient: Gradient(colors: [Color.oliveGreen, Color.lightOlive]),
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            
            if data.isNewUser {
                // Welcome state
                VStack(alignment: .leading, spacing: 4) {
                    Image(data.echoImageName)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(width: 50, height: 50)
                    
                    Text("Welcome!")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundColor(.white)
                    
                    Text("Tap to import your first book")
                        .font(.system(size: 11))
                        .foregroundColor(Color.creamYellow)
                        .lineLimit(2)
                }
                .padding(12)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            } else {
                // Normal streak state
                VStack(alignment: .leading, spacing: 2) {
                    // Streak row
                    HStack(spacing: 4) {
                        Image(systemName: "flame.fill")
                            .foregroundColor(Color.creamYellow)
                            .font(.system(size: 16))
                        Text("\(data.currentStreak)")
                            .font(.system(size: 28, weight: .bold, design: .rounded))
                            .foregroundColor(.white)
                    }
                    
                    Text(streakSubtitle)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(Color.creamYellow.opacity(0.9))
                        .lineLimit(1)
                    
                    Spacer()
                    
                    // Book title or message
                    if data.hasActiveBook {
                        HStack(spacing: 3) {
                            Image(systemName: "book.fill")
                                .font(.system(size: 10))
                                .foregroundColor(Color.creamYellow.opacity(0.8))
                            Text(data.lastBookTitle)
                                .font(.system(size: 11, weight: .medium))
                                .foregroundColor(.white.opacity(0.9))
                                .lineLimit(1)
                        }
                    } else if data.currentStreak == 0 {
                        Text("Start a new streak!")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(.white.opacity(0.9))
                    } else if !data.hasActiveBook && data.booksCompleted > 0 {
                        Text("Import another book!")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(.white.opacity(0.9))
                    }
                }
                .padding(12)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                
                // Echo mascot in bottom-right
                VStack {
                    Spacer()
                    HStack {
                        Spacer()
                        Image(data.echoImageName)
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                            .frame(width: 55, height: 55)
                            .opacity(0.95)
                    }
                }
                .padding(6)
            }
        }
    }
    
    var streakSubtitle: String {
        if data.currentStreak == 0 {
            return "Your streak reset"
        }
        if !data.hasListenedToday {
            return "⚠️ Listen today!"
        }
        return "Day Streak"
    }
}

// MARK: - Medium Widget View

struct MediumStreakView: View {
    let data: StreakData
    
    var body: some View {
        ZStack {
            LinearGradient(
                gradient: Gradient(colors: [Color.oliveGreen, Color.lightOlive]),
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            
            HStack(spacing: 12) {
                // Left side: Stats
                VStack(alignment: .leading, spacing: 4) {
                    // Streak
                    HStack(spacing: 4) {
                        Image(systemName: "flame.fill")
                            .foregroundColor(Color.creamYellow)
                            .font(.system(size: 16))
                        Text("\(data.currentStreak) Day Streak")
                            .font(.system(size: 16, weight: .bold, design: .rounded))
                            .foregroundColor(.white)
                    }
                    
                    if data.isNewUser {
                        Text("Welcome to Audiobooks Mobile!")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(Color.creamYellow)
                        
                        Text("Tap to import your first book")
                            .font(.system(size: 11))
                            .foregroundColor(.white.opacity(0.8))
                    } else {
                        // Book info
                        if data.hasActiveBook {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Currently Reading:")
                                    .font(.system(size: 10, weight: .medium))
                                    .foregroundColor(Color.creamYellow.opacity(0.8))
                                
                                Text(data.lastBookTitle)
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundColor(.white)
                                    .lineLimit(1)
                                
                                if data.totalChapters > 0 {
                                    Text("Chapter \(data.currentChapter) of \(data.totalChapters)")
                                        .font(.system(size: 11))
                                        .foregroundColor(.white.opacity(0.8))
                                }
                            }
                        }
                        
                        Spacer()
                        
                        // Stats row
                        HStack(spacing: 12) {
                            if data.totalListeningMinutes > 0 {
                                HStack(spacing: 3) {
                                    Image(systemName: "headphones")
                                        .font(.system(size: 10))
                                    Text(data.formattedListeningTime)
                                        .font(.system(size: 11, weight: .medium))
                                }
                                .foregroundColor(Color.creamYellow.opacity(0.9))
                            }
                            
                            if data.booksCompleted > 0 {
                                HStack(spacing: 3) {
                                    Image(systemName: "books.vertical.fill")
                                        .font(.system(size: 10))
                                    Text("\(data.booksCompleted)")
                                        .font(.system(size: 11, weight: .medium))
                                }
                                .foregroundColor(Color.creamYellow.opacity(0.9))
                            }
                        }
                    }
                }
                .frame(maxHeight: .infinity, alignment: .top)
                
                Spacer()
                
                // Right side: Echo + Resume
                VStack(spacing: 6) {
                    Image(data.echoImageName)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(width: 70, height: 70)
                    
                    if data.hasActiveBook && !data.isNewUser {
                        HStack(spacing: 4) {
                            Image(systemName: "play.fill")
                                .font(.system(size: 10))
                            Text("Resume")
                                .font(.system(size: 11, weight: .semibold))
                        }
                        .foregroundColor(Color.oliveGreen)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(
                            Capsule()
                                .fill(Color.white.opacity(0.9))
                        )
                    }
                }
                .frame(maxHeight: .infinity, alignment: .center)
            }
            .padding(14)
        }
    }
}

// MARK: - Widget Configuration

struct widget: Widget {
    let kind: String = "EchoStreakWidget"
    
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: StreakProvider()) { entry in
            Group {
                switch entry.widgetFamily {
                case .systemSmall:
                    SmallStreakView(data: entry.data)
                case .systemMedium:
                    MediumStreakView(data: entry.data)
                default:
                    SmallStreakView(data: entry.data)
                }
            }
            .containerBackground(.clear, for: .widget)
        }
        .configurationDisplayName("Echo Streak")
        .description("Track your reading streak with Echo")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// MARK: - Widget Family Environment

private extension StreakEntry {
    var widgetFamily: WidgetFamily {
        // This will be set by the system at runtime
        .systemSmall
    }
}

// MARK: - Previews

#Preview(as: .systemSmall) {
    widget()
} timeline: {
    StreakEntry(date: .now, data: StreakData(
        currentStreak: 5,
        lastLoginDate: "2026-02-11",
        hasListenedToday: true,
        lastBookTitle: "The Secret History",
        lastBookAuthor: "Donna Tartt",
        currentChapter: 3,
        totalChapters: 12,
        totalListeningMinutes: 154,
        booksCompleted: 3,
        echoState: "happy"
    ))
    StreakEntry(date: .now, data: .empty)
}
