export default function NotFound() {
  return (
    <main style={{
      fontFamily: "-apple-system, sans-serif",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh",
      flexDirection: "column",
      color: "#475569",
      background: "#f8fafc",
    }}>
      <h1 style={{ fontSize: 32, fontWeight: 300, margin: 0 }}>404</h1>
      <p style={{ marginTop: 12, fontSize: 14 }}>
        Demo hittades inte
      </p>
    </main>
  );
}
