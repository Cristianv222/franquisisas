import { role, claims } from "./auth";
import Login from "./Login";
import Layout from "./Layout";
import CambiarPassword from "./CambiarPassword";

export default function App() {
  const r = role();
  if (!r) return <Login />;
  if (claims()?.debe_cambiar) return <CambiarPassword />;
  if (r === "ADMIN") {
    window.location.replace("/admin/"); // el admin vive en la otra SPA
    return null;
  }
  return <Layout />;
}
