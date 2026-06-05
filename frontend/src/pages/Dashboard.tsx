import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import "../styles/dashboard.css";

type ProductTotal = {
  name: string;
  quantity: number;
  amount: number;
};

type Stats = {
  scans: number;
  totalAmount: number;
};

type ScanRow = {
  id: number;
  orderCode: string | null;
  customerName?: string | null;
  totalAmount?: number | null;
  status: string;
  ticketDate?: string | null;
  scannedBy?: string | null;
  createdAt: string;
  parsedData?: {
    items?: Array<{
      name: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
    }>;
  };
};

type FilterState = {
  client: string;
  fromDate: string;
  toDate: string;
};

function clampDate(value: string, min?: string, max?: string) {
  if (!value) return true;
  const normalized = value.slice(0, 10);
  if (min && normalized < min) return false;
  if (max && normalized > max) return false;
  return true;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({ scans: 0, totalAmount: 0 });
  const [recentScans, setRecentScans] = useState<ScanRow[]>([]);
  const [filters, setFilters] = useState<FilterState>({ client: "", fromDate: "", toDate: "" });
  const canSeePrices = user?.role === "ADMIN";

  useEffect(() => {
    api
      .get("/dashboard")
      .then((res) => {
        setStats({ scans: res.data.scans ?? 0, totalAmount: res.data.totalAmount ?? 0 });
        setRecentScans(res.data.recentScans || []);
      })
      .catch(() => {
        setStats({ scans: 0, totalAmount: 0 });
        setRecentScans([]);
      });
  }, []);

  const filteredScans = useMemo(() => {
    const clientQuery = filters.client.trim().toLowerCase();
    return recentScans.filter((scan) => {
      if (clientQuery) {
        const clientName = (scan.customerName ?? scan.scannedBy ?? "").toLowerCase();
        if (!clientName.includes(clientQuery)) return false;
      }

      const scanDate = scan.ticketDate || scan.createdAt;
      if (filters.fromDate && !clampDate(scanDate, filters.fromDate, undefined)) return false;
      if (filters.toDate && !clampDate(scanDate, undefined, filters.toDate)) return false;
      return true;
    });
  }, [filters, recentScans]);

  const filteredTotalAmount = useMemo(
    () => filteredScans.reduce((sum, scan) => sum + (scan.totalAmount ?? 0), 0),
    [filteredScans]
  );

  const filteredProductTotals = useMemo(() => {
    const map = new Map<string, ProductTotal>();
    filteredScans.forEach((scan) => {
      const items = scan.parsedData?.items || [];
      items.forEach((item) => {
        const key = item.name.trim();
        if (!key) return;
        const existing = map.get(key) || { name: key, quantity: 0, amount: 0 };
        const qty = Number(item.quantity) || 1;
        const amount = Number(item.totalPrice) || Number(item.unitPrice) * qty || 0;
        existing.quantity += qty;
        existing.amount += amount;
        map.set(key, existing);
      });
    });
    return [...map.values()].sort((a, b) => b.quantity - a.quantity);
  }, [filteredScans]);

  const canSeeScanner = user?.role === "ADMIN";

  return (
    <div className="dashboard-page">
      <div className="dash-header">
        <div>
          <h1>Tableau de bord</h1>
          <p className="muted">
            {canSeeScanner
              ? "Filtrer les tickets par client ou par date. Tous les tickets sont visibles en tant qu'admin."
              : "Vos tickets scannés sont affichés ci-dessous."
            }
          </p>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
            <Link to="/inventory" className="dash-cta">
              Gestion de stock
            </Link>
            <Link to="/proofcam" className="dash-cta">
              + Nouveau scan
            </Link>
          </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <h3>Tickets affichés</h3>
          <p>{filteredScans.length}</p>
        </div>
        <div className="kpi-card">
          <h3>Montant total</h3>
          <p>{canSeePrices ? `${filteredTotalAmount.toFixed(2)}€` : "—"}</p>
        </div>
        <div className="kpi-card">
          <h3>Total tickets</h3>
          <p>{stats.scans}</p>
        </div>
      </div>




      <div className="dash-section filters-section">
        <h2>Filtres</h2>
        <div className="filters-row">
          <label>
            Client / scanner
            <input
              type="text"
              value={filters.client}
              onChange={(e) => setFilters((prev) => ({ ...prev, client: e.target.value }))}
              placeholder="Nom client ou scanneur"
            />
          </label>
          <label>
            Date depuis
            <input
              type="date"
              value={filters.fromDate}
              onChange={(e) => setFilters((prev) => ({ ...prev, fromDate: e.target.value }))}
            />
          </label>
          <label>
            Date jusqu'à
            <input
              type="date"
              value={filters.toDate}
              onChange={(e) => setFilters((prev) => ({ ...prev, toDate: e.target.value }))}
            />
          </label>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setFilters({ client: "", fromDate: "", toDate: "" })}
          >
            Réinitialiser
          </button>
        </div>
      </div>

      <div className="dash-section">
        <h2>Tickets</h2>
        <div className="table-scroll">
          <table className="dash-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Ticket</th>
                <th>Client</th>
                <th>Montant</th>
                <th>Statut</th>
                <th>Date ticket</th>
                {canSeeScanner && <th>Scanné par</th>}
              </tr>
            </thead>
            <tbody>
              {filteredScans.map((scan) => (
                <tr key={scan.id}>
                  <td>{scan.id}</td>
                  <td>
                    {scan.orderCode ? (
                      <Link to={`/proofcam/${scan.id}`}>{scan.orderCode}</Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{scan.customerName ?? "—"}</td>
                  <td>{canSeePrices && scan.totalAmount != null ? `${scan.totalAmount.toFixed(2)}€` : "—"}</td>
                  <td>
                    <span className={`badge ${scan.status === "done" ? "green" : "orange"}`}>
                      {scan.status}
                    </span>
                  </td>
                  <td>{scan.ticketDate ? new Date(scan.ticketDate).toLocaleString() : "—"}</td>
                  {canSeeScanner && <td>{scan.scannedBy ?? "—"}</td>}
                </tr>
              ))}
              {!filteredScans.length && (
                <tr>
                  <td colSpan={canSeeScanner ? 7 : 6} className="empty">
                    Aucun ticket correspondant aux filtres.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {canSeePrices && filteredProductTotals.length > 0 && (
        <div className="dash-section">
          <h2>Total produits</h2>
          <div className="table-scroll">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Produit</th>
                  <th>Quantité</th>
                  <th>Montant</th>
                </tr>
              </thead>
              <tbody>
                {filteredProductTotals.map((product) => (
                  <tr key={product.name}>
                    <td>{product.name}</td>
                    <td>{product.quantity}</td>
                    <td>{product.amount.toFixed(2)}€</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
