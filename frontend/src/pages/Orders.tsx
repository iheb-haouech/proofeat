import { useEffect, useState } from "react";
import { api } from "../api";
import "../styles/dashboard.css";

type Order = {
  id: number;
  client: string;
  amount: number;
  status: string;
};

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    api.get("/orders").then((res) => setOrders(res.data)).catch(() => setOrders([]));
  }, []);

  return (
    <div className="dashboard-page">
      <div className="dash-header">
        <h1>Commandes</h1>
      </div>

      <div className="table-scroll">
        <table className="dash-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Client</th>
              <th>Montant</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>{o.id}</td>
                <td>{o.client}</td>
                <td>{o.amount}€</td>
                <td>{o.status}</td>
              </tr>
            ))}
            {!orders.length && (
              <tr>
                <td colSpan={4} className="empty">
                  Aucune commande enregistrée
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
