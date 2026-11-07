import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  useCallback,
  useEffect,
} from "react";
import {
  useColorScheme,
  AppState,
  Platform,
  View,
  Text,
  ActivityIndicator,
} from "react-native";
import * as SQLite from "expo-sqlite";
import { randomUUID } from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import * as Network from "expo-network";
import { migrateAsync } from "../data/database";
import { Repository } from "../data/repository";
import { Analytics } from "../domain/analytics";
import { localDate, periodRange } from "../domain/model";
import type { Preferences, Filters } from "../domain/model";
import { synchronize } from "../data/sync";
import { apiURL, auth } from "../data/auth";
import { drainNotifications } from "../data/notifications";
import { themes } from "./theme";

export const uid = () => randomUUID();
function useStoreValue(owner: string | null, repository: Repository) {
  const [revision, setRevision] = useState(0);
  const [syncState, setSyncState] = useState("Salvo neste aparelho");
  const [syncing, setSyncing] = useState(false);
  const analytics = useMemo(() => new Analytics(repository.db), [repository]);
  const refresh = useCallback(() => setRevision((n) => n + 1), []);
  const prefs = useMemo(() => repository.preferences(), [repository, revision]);
  const system = useColorScheme();
  const theme =
    themes[
      prefs.theme === "system"
        ? system === "light"
          ? "light"
          : "dark"
        : prefs.theme
    ];
  const filters: Filters = prefs.filters ?? {
    ...periodRange("month"),
    institutions: [],
    walletIds: [],
    walletKinds: [],
    categoryIds: [],
    movement: "all",
  };
  const updatePreferences = (change: Partial<Preferences>) => {
    repository.savePreferences({ ...repository.preferences(), ...change });
    refresh();
  };
  const setFilters = (filters: Filters) => updatePreferences({ filters });
  const sync = useCallback(async () => {
    if (!owner || !apiURL) return;
    setSyncing(true);
    try {
      await synchronize(repository, async (body) => {
        const cookie = Platform.OS === "web" ? null : await auth.getCookie();
        const response = await fetch(`${apiURL}/api/sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(cookie ? { Cookie: cookie } : {}),
          },
          body: JSON.stringify(body),
          credentials: Platform.OS === "web" ? "include" : "omit",
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok)
          throw new Error(
            response.status === 401
              ? "Entre novamente para sincronizar"
              : "Sincronização indisponível",
          );
        return response.json();
      });
      setSyncState(
        repository.conflicts().length
          ? "Há conflitos para revisar"
          : repository.pending().length
            ? "Há operações pendentes. Sincronize novamente ou revise os registros."
            : `Sincronizado · ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`,
      );
    } catch (err) {
      setSyncState(
        err instanceof Error
          ? `${err.message} · dados preservados`
          : "Offline · dados preservados",
      );
    } finally {
      refresh();
      setSyncing(false);
    }
  }, [owner, repository, refresh]);
  useEffect(() => {
    const drain = () => {
      try {
        drainNotifications(repository.db);
      } catch {
        setSyncState(
          "Há capturas pendentes de importação. Abra Automações para revisar.",
        );
      }
      refresh();
    };
    drain();
    void sync();
    const app = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        drain();
        void sync();
      }
    });
    const network = Network.addNetworkStateListener((s) => {
      if (s.isInternetReachable) void sync();
    });
    return () => {
      app.remove();
      network.remove();
    };
  }, [sync, refresh, repository]);
  // Retry queued changes shortly after local mutations; rendering never waits for HTTP.
  const pendingKey = repository
    .pending()
    .map((op) => op.opId)
    .join(",");
  useEffect(() => {
    if (pendingKey && owner) {
      const timer = setTimeout(() => void sync(), 1200);
      return () => clearTimeout(timer);
    }
  }, [pendingKey, repository, owner, sync]);
  return {
    repository,
    analytics,
    revision,
    refresh,
    prefs,
    theme,
    filters,
    setFilters,
    updatePreferences,
    sync,
    syncState,
    syncing,
    owner,
    today: localDate(new Date()),
  };
}
type Store = ReturnType<typeof useStoreValue> & {
  setOwner: (id: string | null) => void;
};
const Context = createContext<Store | null>(null);
export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [owner, changeOwner] = useState<string | null>(() =>
    Platform.OS === "web"
      ? localStorage.getItem("caxe-owner")
      : SecureStore.getItem("caxe-owner"),
  );
  const setOwner = (id: string | null) => {
    if (Platform.OS === "web") {
      if (id) localStorage.setItem("caxe-owner", id);
      else localStorage.removeItem("caxe-owner");
    } else if (id) SecureStore.setItem("caxe-owner", id);
    else void SecureStore.deleteItemAsync("caxe-owner");
    changeOwner(id);
  };
  const [loaded, setLoaded] = useState<{
    owner: string | null;
    repository: Repository;
  } | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let opened: SQLite.SQLiteDatabase | undefined;
    setError(false);
    void SQLite.openDatabaseAsync(
      owner
        ? `caxe-${owner.replace(/[^a-zA-Z0-9_-]/g, "")}.db`
        : "caxe-guest.db",
    )
      .then(async (db) => {
        opened = db;
        if (cancelled) {
          void db.closeAsync();
          return;
        }
        await migrateAsync(db);
        if (cancelled) return;
        setLoaded({ owner, repository: new Repository(db, uid) });
      })
      .catch((error: unknown) => {
        console.error(
          "SQLite initialization failed",
          error instanceof Error ? error.message : "Unknown error",
        );
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
      if (opened) void opened.closeAsync();
    };
  }, [owner]);
  if (!loaded || loaded.owner !== owner || error)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: themes.dark.bg,
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        {error ? (
          <Text style={{ color: themes.dark.text }}>
            Não foi possível abrir os dados locais. Reinicie o app para tentar
            novamente.
          </Text>
        ) : (
          <ActivityIndicator
            accessibilityLabel="Abrindo dados locais"
            color={themes.dark.lime}
          />
        )}
      </View>
    );
  return (
    <ReadyStoreProvider
      owner={owner}
      repository={loaded.repository}
      setOwner={setOwner}
    >
      {children}
    </ReadyStoreProvider>
  );
}
function ReadyStoreProvider({
  owner,
  repository,
  setOwner,
  children,
}: {
  owner: string | null;
  repository: Repository;
  setOwner: (id: string | null) => void;
  children: React.ReactNode;
}) {
  const value = useStoreValue(owner, repository);
  return (
    <Context.Provider value={{ ...value, setOwner }}>
      {children}
    </Context.Provider>
  );
}
export function useStore() {
  const store = useContext(Context);
  if (!store) throw new Error("StoreProvider ausente");
  return store;
}
