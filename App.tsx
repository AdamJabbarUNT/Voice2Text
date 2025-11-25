
import React, { useState } from "react";
import {
  Alert,
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Share,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as Clipboard from "expo-clipboard";

// 👇 Replace this with your real API key for testing.
// DO NOT commit your real key to GitHub.
const OPENAI_API_KEY = "YOUR_OPENAI_API_KEY_HERE";

type Screen =
  | "login"
  | "dashboard"
  | "transcript"
  | "summary"
  | "files"
  | "profile";

type Session = {
  id: string;
  title: string;
  fileName: string;
  transcript: string;
  summary: string;
};

export default function App() {
  const [screen, setScreen] = useState<Screen>("login");

  // Login form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Current audio + processing state
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [selectedFileUri, setSelectedFileUri] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [summary, setSummary] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);

  // "My Files" list
  const [sessions, setSessions] = useState<Session[]>([]);

  // Helpers
  const currentSessionTitle =
    selectedFileName || (sessions[0]?.title ?? "Lecture / Meeting");

  const canCallOpenAI = () => {
    if (!OPENAI_API_KEY || OPENAI_API_KEY === "YOUR_OPENAI_API_KEY_HERE") {
      Alert.alert(
        "Missing API key",
        "Open App.tsx and set your real OpenAI API key in OPENAI_API_KEY before using transcription."
      );
      return false;
    }
    return true;
  };

  const handleLogin = () => {
    if (!email || !password) {
      Alert.alert("Login", "Enter email and password (any values for demo).");
      return;
    }
    setScreen("dashboard");
  };

  const handlePickAudio = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["audio/*"],
      copyToCacheDirectory: true,
    });

    if (result.canceled) return;

    const file = result.assets[0];
    setSelectedFileName(file.name);
    setSelectedFileUri(file.uri);
    setTranscript("");
    setSummary("");
    Alert.alert("File selected", file.name);
  };

  // --- OpenAI calls ---

  const transcribeWithOpenAI = async (uri: string, fileName: string) => {
    if (!canCallOpenAI()) return;

    try {
      setIsTranscribing(true);
      const formData = new FormData();
      formData.append("file", {
        uri,
        name: fileName,
        type: "audio/m4a",
      } as any);

      // Model names may change over time; if this fails,
      // check the latest OpenAI docs for the current audio model.
      formData.append("model", "gpt-4o-mini-transcribe");

      const response = await fetch(
        "https://api.openai.com/v1/audio/transcriptions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        console.error("Transcription error:", errText);
        Alert.alert("Transcription failed", errText);
        return;
      }

      const json: any = await response.json();
      const text: string = json.text ?? "";
      setTranscript(text);
      setScreen("transcript");
    } catch (err: any) {
      console.error(err);
      Alert.alert("Error", "Could not transcribe audio.");
    } finally {
      setIsTranscribing(false);
    }
  };

  const summarizeWithOpenAI = async (text: string) => {
    if (!canCallOpenAI()) return;

    try {
      setIsSummarizing(true);
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          messages: [
            {
              role: "system",
              content:
                "You are a helpful assistant that reads transcripts from lectures or meetings and returns a short bullet-point summary of the KEY POINTS only.",
            },
            {
              role: "user",
              content: text,
            },
          ],
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("Summary error:", errText);
        Alert.alert("Summary failed", errText);
        return;
      }

      const json: any = await response.json();
      const content: string =
        json.choices?.[0]?.message?.content ?? "No summary generated.";
      setSummary(content);
      setScreen("summary");
    } catch (err: any) {
      console.error(err);
      Alert.alert("Error", "Could not summarize transcript.");
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleStartProcessing = async () => {
    if (!selectedFileUri || !selectedFileName) {
      Alert.alert("No file", "Choose an audio file first.");
      return;
    }
    await transcribeWithOpenAI(selectedFileUri, selectedFileName);
  };

  const handleGenerateSummary = async () => {
    if (!transcript.trim()) {
      Alert.alert("No transcript", "Transcribe audio before summarizing.");
      return;
    }
    await summarizeWithOpenAI(transcript);
  };

  const handleExport = async () => {
    if (!transcript && !summary) {
      Alert.alert("Nothing to export", "Create a transcript or summary first.");
      return;
    }

    const combined = `Session: ${currentSessionTitle}\n\nTranscript:\n${transcript}\n\nSummary:\n${summary}`;

    try {
      await Share.share({ message: combined });
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Could not open share sheet.");
    }
  };

  const handleCopy = async (text: string) => {
    if (!text.trim()) {
      Alert.alert("Nothing to copy", "No content available yet.");
      return;
    }
    await Clipboard.setStringAsync(text);
    Alert.alert("Copied", "Text copied to clipboard.");
  };

  const saveCurrentSession = () => {
    if (!transcript && !summary) {
      Alert.alert("Nothing to save", "Transcribe or summarize before saving.");
      return;
    }
    const newSession: Session = {
      id: Date.now().toString(),
      title: currentSessionTitle,
      fileName: selectedFileName ?? "Unknown file",
      transcript,
      summary,
    };
    setSessions((prev) => [newSession, ...prev]);
    Alert.alert("Saved", "Session saved to My Files.");
  };

  const openSessionFromFiles = (session: Session) => {
    setSelectedFileName(session.fileName);
    setTranscript(session.transcript);
    setSummary(session.summary);
    setScreen("transcript");
  };

  // ----- Small UI components -----

  const PrimaryButton = ({
    title,
    onPress,
    disabled,
  }: {
    title: string;
    onPress: () => void;
    disabled?: boolean;
  }) => (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.primaryButton,
        disabled ? { opacity: 0.5 } : undefined,
      ]}
    >
      <Text style={styles.primaryButtonText}>{title}</Text>
    </TouchableOpacity>
  );

  const OutlineButton = ({
    title,
    onPress,
  }: {
    title: string;
    onPress: () => void;
  }) => (
    <TouchableOpacity onPress={onPress} style={styles.outlineButton}>
      <Text style={styles.outlineButtonText}>{title}</Text>
    </TouchableOpacity>
  );

  const BottomNav = () => (
    <View style={styles.navBar}>
      <TouchableOpacity onPress={() => setScreen("dashboard")}>
        <Text
          style={[
            styles.navItem,
            screen === "dashboard" || screen === "transcript" || screen === "summary"
              ? styles.navItemActive
              : null,
          ]}
        >
          Home
        </Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setScreen("dashboard")}>
        <View style={styles.micButtonOuter}>
          <View style={styles.micButtonInner} />
        </View>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setScreen("files")}>
        <Text style={[styles.navItem, screen === "files" ? styles.navItemActive : null]}>
          Files
        </Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setScreen("profile")}>
        <Text
          style={[styles.navItem, screen === "profile" ? styles.navItemActive : null]}
        >
          Profile
        </Text>
      </TouchableOpacity>
    </View>
  );

  // ----- Screens -----

  const LoginScreen = () => (
    <SafeAreaView style={styles.container}>
      <View style={styles.centerContent}>
        <Text style={styles.appTitle}>Voice2Text</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="you@example.com"
          />
          <Text style={[styles.label, { marginTop: 12 }]}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••••"
          />
          <PrimaryButton title="Log in" onPress={handleLogin} />
        </View>
      </View>
    </SafeAreaView>
  );

  const DashboardScreen = () => (
    <SafeAreaView style={styles.container}>
      <Text style={styles.appTitleTop}>Voice2Text</Text>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Upload or record</Text>
          <Text style={styles.cardSubtitle}>
            Upload lecture audio, meetings, or voice notes and generate a transcript + key
            point summary.
          </Text>
          <View style={styles.row}>
            <OutlineButton title={selectedFileName || "Choose file"} onPress={handlePickAudio} />
            <PrimaryButton
              title={isTranscribing ? "Transcribing..." : "Start"}
              onPress={handleStartProcessing}
              disabled={isTranscribing}
            />
          </View>
          {selectedFileName && (
            <Text style={styles.smallText}>Selected: {selectedFileName}</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Last transcript</Text>
          <Text style={styles.cardSubtitle} numberOfLines={3}>
            {transcript
              ? transcript
              : "Your latest transcript will appear here after you process a file."}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Quick actions</Text>
          <View style={styles.row}>
            <OutlineButton title="Generate summary" onPress={handleGenerateSummary} />
            <OutlineButton title="Save session" onPress={saveCurrentSession} />
          </View>
        </View>
      </ScrollView>
      <BottomNav />
    </SafeAreaView>
  );

  const TranscriptSummaryTabs = () => (
    <View style={styles.tabsRow}>
      <TouchableOpacity
        style={[
          styles.tab,
          screen === "transcript" ? styles.tabActive : undefined,
        ]}
        onPress={() => setScreen("transcript")}
      >
        <Text
          style={[
            styles.tabText,
            screen === "transcript" ? styles.tabTextActive : undefined,
          ]}
        >
          Transcript
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.tab, screen === "summary" ? styles.tabActive : undefined]}
        onPress={() => setScreen("summary")}
      >
        <Text
          style={[
            styles.tabText,
            screen === "summary" ? styles.tabTextActive : undefined,
          ]}
        >
          Summary
        </Text>
      </TouchableOpacity>
    </View>
  );

  const TranscriptScreen = () => (
    <SafeAreaView style={styles.container}>
      <Text style={styles.appTitleTop}>Session — {currentSessionTitle}</Text>
      <TranscriptSummaryTabs />
      <ScrollView contentContainerStyle={styles.textAreaContainer}>
        <Text style={styles.textArea}>
          {transcript || "Transcript will appear here after processing your audio file."}
        </Text>
      </ScrollView>
      <View style={styles.bottomButtonsRow}>
        <OutlineButton title="Copy" onPress={() => handleCopy(transcript)} />
        <OutlineButton
          title={isSummarizing ? "Summarizing..." : "Summary"}
          onPress={handleGenerateSummary}
        />
        <PrimaryButton title="Export" onPress={handleExport} />
      </View>
      <BottomNav />
    </SafeAreaView>
  );

  const SummaryScreen = () => (
    <SafeAreaView style={styles.container}>
      <Text style={styles.appTitleTop}>Session — {currentSessionTitle}</Text>
      <TranscriptSummaryTabs />
      <ScrollView contentContainerStyle={styles.textAreaContainer}>
        <Text style={styles.textArea}>
          {summary ||
            "Key points summary will appear here after you generate it from the transcript."}
        </Text>
      </ScrollView>
      <View style={styles.bottomButtonsRow}>
        <OutlineButton title="Copy" onPress={() => handleCopy(summary)} />
        <OutlineButton title="Transcript" onPress={() => setScreen("transcript")} />
        <PrimaryButton title="Export" onPress={handleExport} />
      </View>
      <BottomNav />
    </SafeAreaView>
  );

  const FilesScreen = () => (
    <SafeAreaView style={styles.container}>
      <Text style={styles.appTitleTop}>Voice2Text</Text>
      <Text style={[styles.cardTitle, { paddingHorizontal: 20 }]}>My Files</Text>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {sessions.length === 0 && (
          <Text style={[styles.cardSubtitle, { paddingHorizontal: 20 }]}>
            Saved sessions will appear here after you tap "Save session" on the dashboard.
          </Text>
        )}
        {sessions.map((s) => (
          <TouchableOpacity
            key={s.id}
            style={styles.card}
            onPress={() => openSessionFromFiles(s)}
          >
            <Text style={styles.cardTitle}>{s.title}</Text>
            <Text style={styles.smallText}>{s.fileName}</Text>
            <Text style={styles.cardSubtitle} numberOfLines={2}>
              {s.summary || s.transcript || "Empty session"}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <BottomNav />
    </SafeAreaView>
  );

  const ProfileScreen = () => (
    <SafeAreaView style={styles.container}>
      <Text style={styles.appTitleTop}>Profile & Settings</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Account</Text>
        <Text style={styles.smallText}>{email || "student@example.edu"}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Subscription</Text>
        <Text style={styles.smallText}>Free: 60 minutes / month</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Dark Mode</Text>
        <Text style={styles.smallText}>Toggle handled by system theme (not implemented).</Text>
      </View>
      <BottomNav />
    </SafeAreaView>
  );

  // ----- Top-level render -----
  if (screen === "login") return <LoginScreen />;
  if (screen === "dashboard") return <DashboardScreen />;
  if (screen === "transcript") return <TranscriptScreen />;
  if (screen === "summary") return <SummaryScreen />;
  if (screen === "files") return <FilesScreen />;
  return <ProfileScreen />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7FB",
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  appTitle: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 24,
    color: "#1F2933",
  },
  appTitleTop: {
    fontSize: 24,
    fontWeight: "700",
    marginTop: 16,
    marginBottom: 12,
    textAlign: "center",
    color: "#1F2933",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 4,
    color: "#4B5563",
  },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 16,
    backgroundColor: "#FFFFFF",
  },
  primaryButton: {
    backgroundColor: "#2563EB",
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  outlineButton: {
    borderWidth: 1,
    borderColor: "#CBD5F5",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
    marginTop: 8,
  },
  outlineButtonText: {
    color: "#2563EB",
    fontSize: 13,
    fontWeight: "500",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
    color: "#111827",
  },
  cardSubtitle: {
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 8,
  },
  smallText: {
    fontSize: 11,
    color: "#9CA3AF",
    marginTop: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    flexWrap: "wrap",
  },
  textAreaContainer: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  textArea: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    fontSize: 14,
    color: "#111827",
    minHeight: 260,
  },
  bottomButtonsRow: {
    position: "absolute",
    bottom: 80,
    left: 20,
    right: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  tabsRow: {
    flexDirection: "row",
    backgroundColor: "#E5E7EB",
    borderRadius: 999,
    marginHorizontal: 20,
    padding: 4,
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    borderRadius: 999,
    alignItems: "center",
    paddingVertical: 8,
  },
  tabActive: {
    backgroundColor: "#FFFFFF",
  },
  tabText: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "500",
  },
  tabTextActive: {
    color: "#2563EB",
  },
  navBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 70,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  navItem: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  navItemActive: {
    color: "#2563EB",
    fontWeight: "600",
  },
  micButtonOuter: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#2563EB20",
    justifyContent: "center",
    alignItems: "center",
  },
  micButtonInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#2563EB",
  },
});
