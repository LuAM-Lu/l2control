"use client";

import { useEffect } from "react";

/**
 * Registra el Service Worker en producción.
 *
 * En desarrollo no se registra para no interferir con la recarga en caliente.
 */
export function RegistroServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Fallo silencioso si no se puede registrar
      });
    }
  }, []);

  return null;
}
