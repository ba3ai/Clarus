// frontend/src/components/integrations/ConnectQuickBooks.jsx
import React, { useState } from "react";

export default function ConnectQuickBooks({ className = "" }) {
  const [loading, setLoading] = useState(false);

  const handleConnect = () => {
    try {
      setLoading(true);
      window.location.href = "/api/qbo/connect"; // backend route
    } finally {
      // leave loading until redirect happens
    }
  };

  return (
    <button
      onClick={handleConnect}
      disabled={loading}
      className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 shadow-sm border hover:shadow-md ${className}`}
    >
      {loading ? "Connecting..." : (
        <>
          {/* simple SVG plug icon */}
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 6v6a5 5 0 1 0 10 0V6h2V4h-4v8a3 3 0 1 1-6 0V4H5v2h2z"></path>
          </svg>
          <span>Connect to QuickBooks</span>
        </>
      )}
    </button>
  );
}
