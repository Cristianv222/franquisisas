import { role } from "./auth";
import Layout from "./Layout";

export default function App() {
  if (role() !== "ADMIN") {
    // El login único vive en la SPA de franquicia (raíz).
    window.location.replace("/");
    return null;
  }
  return <Layout />;
}
