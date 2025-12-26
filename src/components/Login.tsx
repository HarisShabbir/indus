import React, { FormEvent, useState } from "react";
import { readSavedCredentials } from "../utils/auth";

type ThemeMode = "dark" | "light";

interface LoginProps {
  onBack: () => void;
  onLogin: (credentials: { username: string; password: string }) => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
}

export function Login({ onBack, onLogin, theme, onToggleTheme }: LoginProps) {
  const [error, setError] = useState<string | null>(null);
  const savedCredentials = readSavedCredentials();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const username = String(formData.get("username") || "");
    const password = String(formData.get("password") || "");

    if (username === "demo@dipgos" && password === "Secure!Demo2025") {
      setError(null);
      onLogin({ username, password });
      return;
    }

    setError(
      "Invalid credentials. Use demo@dipgos / Secure!Demo2025 or request access from the PMO."
    );
  };

  return (
    <div className="login-container" data-theme={theme}>
      <div className="login-top-bar">
      </div>
      <div className="login-content">
        <div className="login-header">
          <h1>Welcome to DiPGOS</h1>
          <p className="login-subtitle">A Project Operating System</p>
        </div>

        <div className="login-card">
          <h2>Sign in to DiPGOS</h2>
          <p className="login-description">
            Secure access for project executives, construction leads, and
            governance teams.
          </p>
          <form className="login-form" onSubmit={handleSubmit}>
            <label>
              Username
              <input
                name="username"
                placeholder="demo@dipgos"
                autoComplete="username"
                defaultValue={savedCredentials.username}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                name="password"
                placeholder="Secure!Demo2025"
                autoComplete="current-password"
                defaultValue={savedCredentials.password}
              />
            </label>
            {error && <span className="login-error">{error}</span>}
            <button type="submit">Enter control center</button>
          </form>
          <div className="login-footer">
            Need an enterprise walkthrough?{" "}
            <a href="mailto:hello@dipgos.example">hello@dipgos.example</a>
          </div>
        </div>
      </div>
    </div>
  );
}

