import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../auth/AuthProvider";

export type AuthMode = "sign_in" | "sign_up";

/** Owns the signed-out account form state and translates auth failures into form feedback. */
export const useSignedOutAccountAuth = () => {
  const { signInWithEmail, signInWithGoogle, signUpWithEmail, error, status } =
    useAuth();
  const [mode, setMode] = useState<AuthMode>("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isBusy = submitting || status === "loading";

  useEffect(() => {
    if (mode === "sign_in") {
      setConfirmPassword("");
    }
  }, [mode]);

  /** Handles email/password sign-in or sign-up based on the selected account mode. */
  const handleEmailSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);

    if (mode === "sign_up" && password !== confirmPassword) {
      setFormError("Passwords do not match.");
      return;
    }

    setSubmitting(true);

    try {
      if (mode === "sign_in") {
        await signInWithEmail(email, password);
      } else {
        await signUpWithEmail(email, password);
      }
      setPassword("");
      setConfirmPassword("");
    } catch (nextError) {
      setFormError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to complete that request right now.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  /** Starts the hosted Google sign-in flow. */
  const handleGoogleSignIn = async () => {
    setFormError(null);
    setSubmitting(true);

    try {
      await signInWithGoogle();
    } catch (nextError) {
      setFormError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to start Google sign-in right now.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  /** Wraps Google sign-in for button usage without inline promise handling in JSX. */
  const handleGoogleSignInClick = () => {
    handleGoogleSignIn().catch(() => {
      // Form feedback is already handled by handleGoogleSignIn.
    });
  };

  return {
    mode,
    email,
    password,
    confirmPassword,
    isBusy,
    formError,
    authError: error,
    setMode,
    setEmail,
    setPassword,
    setConfirmPassword,
    handleEmailSubmit,
    handleGoogleSignInClick,
  };
};
