"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

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
      renderButton: (
        parent: HTMLElement,
        options: {
          theme: "outline";
          size: "large";
          text: "continue_with";
          shape: "rectangular";
          width: number;
          logo_alignment: "left";
        },
      ) => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentityServices;
  }
}

interface GoogleSignInButtonProps {
  disabled: boolean;
  onCredential: (credential: string) => Promise<void>;
  onError: (message: string) => void;
}

const GOOGLE_SCRIPT = "https://accounts.google.com/gsi/client";
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

export function GoogleSignInButton({
  disabled,
  onCredential,
  onError,
}: GoogleSignInButtonProps) {
  const buttonContainer = useRef<HTMLDivElement>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [scriptError, setScriptError] = useState("");

  const handleCredential = useCallback(
    (response: GoogleCredentialResponse) => {
      if (!response.credential) {
        onError("Google sign-in did not return a credential. Please try again.");
        return;
      }
      void onCredential(response.credential);
    },
    [onCredential, onError],
  );

  useEffect(() => {
    const container = buttonContainer.current;
    if (!scriptReady || !container || !GOOGLE_CLIENT_ID || !window.google) {
      return;
    }

    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleCredential,
    });

    const renderGoogleButton = () => {
      if (!buttonContainer.current || !window.google) return;
      buttonContainer.current.replaceChildren();
      window.google.accounts.id.renderButton(buttonContainer.current, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        width: Math.min(Math.floor(container.clientWidth), 400),
        logo_alignment: "left",
      });
    };

    renderGoogleButton();
    const observer = new ResizeObserver(renderGoogleButton);
    observer.observe(container);
    return () => observer.disconnect();
  }, [handleCredential, scriptReady]);

  if (!GOOGLE_CLIENT_ID) {
    return (
      <p className="google-signin-unavailable" role="status">
        Google sign-in is not configured. You can continue with your email and
        password.
      </p>
    );
  }

  return (
    <div className={`google-signin${disabled ? " is-disabled" : ""}`}>
      <Script
        src={GOOGLE_SCRIPT}
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
        onError={() =>
          setScriptError("Google sign-in could not load. Please try again.")
        }
      />
      {scriptError ? (
        <p className="form-error" role="alert">{scriptError}</p>
      ) : (
        <div
          ref={buttonContainer}
          aria-disabled={disabled}
          aria-busy={disabled}
          className="google-signin-button"
        />
      )}
      {disabled && !scriptError ? (
        <span className="google-signin-loading" role="status">
          Signing in with Google…
        </span>
      ) : null}
    </div>
  );
}
