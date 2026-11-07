import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";
export const apiURL = process.env.EXPO_PUBLIC_API_URL;
export const auth = createAuthClient({
  baseURL: apiURL ?? "http://localhost:8787",
  plugins: [
    expoClient({ scheme: "caxe", storagePrefix: "caxe", storage: SecureStore }),
  ],
});
