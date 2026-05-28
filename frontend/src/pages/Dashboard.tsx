import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, API_BASE } from "../api";
import "../styles/dashboard.css";

type Stats = { orders: number; claims: number; recovered: number; scans?: number };
type Order = {
  id: number;
  client: string;
  amount: number;
  status: string;
  image?: string | null;
};

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({ orders: 0, claims: 0, recovered: 0, scans: 0 });
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    api.get("/dashboard").then((res) => setStats(res.data)).catch(() => {});
    api.get("/orders").then((res) => setOrders(res.data)).catch(() => setOrders([]));
  }, []);

  return (
    <div className="dashboard-page">
      <div className="dash-header">
        <h1>Tableau de bord</h1>
        <Link to="/proofcam" className="dash-cta">
          + Nouveau scan
        </Link>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <h3>Scans ProofCam</h3>
          <p>{stats.scans ?? 0}</p>
        </div>
        <div className="kpi-card">
          <h3>Commandes</h3>
          <p>{stats.orders}</p>
        </div>
        <div className="kpi-card">
          <h3>Réclamations</h3>
          <p>{stats.claims}</p>
        </div>
      </div>

      <div className="dash-section">
        <h2>Dernières commandes</h2>
        <div className="table-scroll">
          <table className="dash-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Client</th>
                <th>Montant</th>
                <th>Statut</th>
                <th>Image</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>{o.id}</td>
                  <td>{o.client}</td>
                  <td>{o.amount}€</td>
                  <td>
                    <span className={`badge ${o.status === "scanned" ? "green" : "orange"}`}>
                      {o.status}
                    </span>
                  </td>
                  <td>
                    {o.image ? (
                      <img src={`${API_BASE}/${o.image}`} alt="" className="dash-thumb" />
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
              {!orders.length && (
                <tr>
                  <td colSpan={5} className="empty">
                    Aucune commande
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
