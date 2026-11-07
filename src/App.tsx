import React, { useState, useEffect, useRef } from "react";
import {
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Text,
  BackHandler,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";
import { useFonts } from "expo-font";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { StoreProvider, useStore, uid } from "./ui/store";
import { Label, Action, s } from "./ui/components";
import {
  Home,
  Analysis,
  History,
  Wallets,
  WalletDetail,
  Settings,
  TransactionDetail,
  Account,
  Capture,
} from "./ui/Screens";
import type { Screen } from "./ui/Screens";
import { WalletForm, TransactionForm, CategoryForm } from "./ui/Forms";

const nav = [
  {
    name: "home",
    label: "Início",
    dark: require("../assets/figma/home-dark.svg"),
    light: require("../assets/figma/home-light.svg"),
  },
  {
    name: "history",
    label: "Atividade",
    dark: require("../assets/figma/activity-dark.svg"),
    light: require("../assets/figma/activity-light.svg"),
  },
  {
    name: "wallets",
    label: "Carteiras",
    dark: require("../assets/figma/wallet-dark.svg"),
    light: require("../assets/figma/wallet-light.svg"),
  },
  {
    name: "settings",
    label: "Ajustes",
    dark: require("../assets/figma/settings-dark.svg"),
    light: require("../assets/figma/settings-light.svg"),
  },
] as const;
function Shell() {
  const { theme, repository, refresh, owner } = useStore();
  const [stack, setStack] = useState<Screen[]>([{ name: "home" }]);
  const [ready, setReady] = useState(false);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const screen = stack.at(-1)!;
  const navigate = (s: Screen) => {
    setStack((x) => [...x, s]);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const back = () => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  useEffect(() => {
    setStack([{ name: "home" }]);
  }, [owner]);
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 40);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (stack.length > 1) {
        back();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [stack.length]);
  useEffect(() => {
    const handle = (url: string) => {
      const parsed = Linking.parse(url);
      if (parsed.hostname !== "capture" && parsed.path !== "capture") return;
      const text = parsed.queryParams?.text;
      if (typeof text !== "string" || !text.trim() || text.length > 8000) {
        Alert.alert(
          "Texto inválido",
          "Envie um texto com até 8.000 caracteres.",
        );
        return;
      }
      const capture = {
        id: uid(),
        text,
        source: "shortcut",
        receivedAt: new Date().toISOString(),
      };
      repository.db.runSync(
        "INSERT INTO capture_inbox VALUES (?,?,?,?)",
        capture.id,
        capture.text,
        capture.source,
        capture.receivedAt,
      );
      refresh();
      navigate({ name: "review", capture });
    };
    void Linking.getInitialURL().then((url) => {
      if (url) handle(url);
    });
    const sub = Linking.addEventListener("url", (event) => handle(event.url));
    return () => sub.remove();
  }, [repository, refresh]);
  const content = () => {
    switch (screen.name) {
      case "home":
        return <Home navigate={navigate} />;
      case "analysis":
        return <Analysis navigate={navigate} />;
      case "history":
        return <History navigate={navigate} />;
      case "wallets":
        return <Wallets navigate={navigate} />;
      case "wallet":
        return <WalletDetail id={screen.id} navigate={navigate} />;
      case "settings":
        return <Settings navigate={navigate} />;
      case "transaction":
        return <TransactionDetail id={screen.id} navigate={navigate} />;
      case "newWallet":
        return <WalletForm onDone={back} />;
      case "newTransaction":
        return <TransactionForm onDone={back} />;
      case "editTransaction":
        return <TransactionForm edit={screen.transaction} onDone={back} />;
      case "newCategory":
        return <CategoryForm onDone={back} />;
      case "capture":
        return <Capture navigate={navigate} />;
      case "review":
        return <TransactionForm capture={screen.capture} onDone={back} />;
      case "account":
        return <Account onDone={() => setStack([{ name: "settings" }])} />;
    }
  };
  const selected = ["wallet", "newWallet"].includes(screen.name)
    ? "wallets"
    : ["transaction", "newTransaction", "editTransaction", "review"].includes(
          screen.name,
        )
      ? "history"
      : ["capture", "newCategory", "account"].includes(screen.name)
        ? "settings"
        : screen.name === "analysis"
          ? "home"
          : screen.name;
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.bg }}
      edges={["top", "left", "right"]}
    >
      <StatusBar style={theme.mode === "dark" ? "light" : "dark"} />
      {!ready ? (
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <ActivityIndicator
            color={theme.limeText}
            accessibilityLabel="Abrindo dados locais"
          />
        </View>
      ) : (
        <ScrollView
          ref={scroll}
          contentContainerStyle={s.page}
          keyboardShouldPersistTaps="handled"
        >
          {stack.length > 1 && (
            <Action secondary title="‹ Voltar" onPress={back} />
          )}
          <React.Fragment key={owner ?? "guest"}>{content()}</React.Fragment>
        </ScrollView>
      )}
      <SafeAreaView
        edges={["bottom"]}
        style={{ backgroundColor: theme.surface }}
      >
        <View
          style={{
            flexDirection: "row",
            borderTopWidth: 1,
            borderTopColor: theme.border,
          }}
        >
          {nav.map((item) => (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: selected === item.name }}
              aria-selected={selected === item.name}
              key={item.name}
              onPress={() => {
                setStack([{ name: item.name }]);
                scroll.current?.scrollTo({ y: 0, animated: false });
              }}
              style={({ pressed }) => ({
                flex: 1,
                alignItems: "center",
                paddingTop: 16,
                paddingBottom: 12,
                gap: 8,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              {selected === item.name && (
                <View
                  style={{
                    position: "absolute",
                    top: 1,
                    height: 3,
                    width: 28,
                    borderRadius: 2,
                    backgroundColor: theme.lime,
                  }}
                />
              )}
              <Image
                source={theme.mode === "dark" ? item.dark : item.light}
                style={{ width: 23, height: 23 }}
              />
              <Label
                size={11}
                style={{
                  color: selected === item.name ? theme.limeText : theme.muted,
                }}
              >
                {item.label}
              </Label>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>
    </SafeAreaView>
  );
}
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <View
        style={{
          flex: 1,
          padding: 30,
          justifyContent: "center",
          gap: 20,
          backgroundColor: "#090D0B",
        }}
      >
        <Text style={{ color: "#F4F7F1", fontSize: 22 }}>
          Não foi possível abrir os dados locais.
        </Text>
        <Text style={{ color: "#9BAA9C" }}>
          Seus dados não foram apagados. Feche e abra o aplicativo para tentar
          novamente.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => this.setState({ error: false })}
        >
          <Text style={{ color: "#CDFF57" }}>Tentar novamente</Text>
        </Pressable>
      </View>
    ) : (
      this.props.children
    );
  }
}
export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  if (!fontsLoaded && !fontError)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#090D0B",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator
          accessibilityLabel="Carregando fonte local"
          color="#CDFF57"
        />
      </View>
    );
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <StoreProvider>
          <Shell />
        </StoreProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
