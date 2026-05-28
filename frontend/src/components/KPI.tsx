export default function KPI({ title, value }: any) {
  return (
    <div style={{
      background: "#1e293b",
      padding: "20px",
      borderRadius: "12px",
      flex: 1,
      textAlign: "center",
      boxShadow: "0 10px 20px rgba(0,0,0,0.3)"
    }}>
      <p style={{ opacity: 0.7 }}>{title}</p>
      <h1 style={{ margin: 0 }}>{value}</h1>
    </div>
  );
}