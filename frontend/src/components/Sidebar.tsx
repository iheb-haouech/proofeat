import { Link } from "react-router-dom";

export default function Sidebar() {
  return (
    <div className="sidebar">
      <h2>ProofEat</h2>

      <nav>
        <Link to="/dashboard">Dashboard</Link>
        <Link to="/proofcam">Scan Ticket</Link>
        <Link to="/orders">Orders</Link>
      </nav>
    </div>
  );
}