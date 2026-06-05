import { Routes, Route, Navigate } from "react-router-dom";
import MainLayout from "./layouts/MainLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ProofCam from "./pages/ProofCam";
import ProofCamDetail from "./pages/ProofCamDetail";
import Orders from "./pages/Orders";
import InventoryPage from "./pages/InventoryPage";
import SuperAdminPage from "./pages/SuperAdminPage";
import Profile from "./pages/Profile";

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/inscription" element={<Register />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/superadmin" element={<SuperAdminPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<MainLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/proofcam" element={<ProofCam />} />
          <Route path="/proofcam/:id" element={<ProofCamDetail />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/profile" element={<Profile />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;