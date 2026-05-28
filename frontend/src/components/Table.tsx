export default function Table({ data }: any) {
  return (
    <div style={{
      background: "#1e293b",
      borderRadius: "12px",
      padding: "10px"
    }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ opacity: 0.7 }}>
            <th>ID</th>
            <th>Client</th>
            <th>Amount</th>
            <th>Status</th>
          </tr>
        </thead>

        <tbody>
          {data.map((order: any) => (
            <tr key={order.id} style={{
              textAlign: "center",
              borderTop: "1px solid #334155"
            }}>
              <td>{order.id}</td>
              <td>{order.client}</td>
              <td>{order.amount}€</td>
              <td>
                <span style={{
                  background: "#22c55e",
                  padding: "5px 10px",
                  borderRadius: "10px",
                  fontSize: "12px"
                }}>
                  {order.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}