"use client";

// Catches errors thrown in the root layout itself. Must render its own
// <html>/<body>. Kept dependency-free (no app styles guaranteed here).
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          background: "#EBF1F5",
          fontFamily: "system-ui, sans-serif",
          color: "#0F1B2D",
          textAlign: "center",
          padding: 24,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 800 }}>Something went wrong</div>
        <div style={{ fontSize: 13, color: "#6A7686", maxWidth: 280 }}>
          FloodWatch BD hit an unexpected error. Please try again.
        </div>
        <button
          type="button"
          onClick={reset}
          style={{
            border: 0,
            background: "#1466C7",
            color: "#fff",
            fontWeight: 800,
            fontSize: 14,
            padding: "12px 24px",
            borderRadius: 14,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
