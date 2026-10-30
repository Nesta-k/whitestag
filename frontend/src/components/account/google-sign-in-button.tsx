"use client";

import { useEffect, useRef, useState } from "react";

interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleIdentityServices {
  accounts: {
    id: {
      initialize: (options: {
        client_id: string;
        callback: (response: GoogleCredentialResponse) => void;
      }) => void;
      renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentityServices;
  }
}

const SCRIPT_SRC = "https://accounts.google.com/gsi/client";
const READY_TIMEOUT_MS = 10000;

let googleReady: Promise<GoogleIdentityServices> | null = null;

function ensureScript(): void {
  if (typeof document === "undefined") return;
  if (document.querySelector(`script[src="${SCRIPT_SRC}"]`)) return;
  const script = document.createElement("script");
  script.src = SCRIPT_SRC;
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
}

function waitForGoogle(): Promise<GoogleIdentityServices> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = () => {
      const google = window.google;
      if (google?.accounts?.id) {
        resolve(google);
        return;
      }
      if (Date.now() - started > READY_TIMEOUT_MS) {
        reject(new Error("Could not load Google sign-in. Please try again."));
        return;
      }
      window.setTimeout(poll, 100);
    };
    poll();
  });
}

function getGoogle(): Promise<GoogleIdentityServices> {
  if (typeof window === "undefined") {
    return Promise.reject(
      new Error("Google sign-in is only available in the browser."),
    );
  }
  if (!googleReady) {
    ensureScript();
    googleReady = waitForGoogle().catch((error: unknown) => {
      googleReady = null;
      throw error;
    });
  }
  return googleReady;
}

export default function GoogleSignInButton({
  onCredential,
  onError,
}: {
  onCredential: (credential: string) => void;
  onError: (message: string) => void;
}) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!clientId || !container) return;

    let cancelled = false;

    getGoogle()
      .then((google) => {
        if (cancelled) return;
        google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            if (response.credential) {
              onCredential(response.credential);
            } else {
              onError("Google did not return a sign-in credential.");
            }
          },
        });
        google.accounts.id.renderButton(container, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          logo_alignment: "left",
          width: 336,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setFailed(true);
        onError(
          error instanceof Error
            ? error.message
            : "Could not load Google sign-in. Please try again.",
        );
      });

    return () => {
      cancelled = true;
      container.innerHTML = "";
    };
  }, [clientId, onCredential, onError]);

  if (!clientId || failed) return null;

  return <div className="google-signin" ref={containerRef} />;
}
