import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Leg de workspace-root expliciet op deze projectmap vast. Zonder dit kiest
  // Next soms de verkeerde root door een losse package-lock.json in een hogere
  // map (de "multiple lockfiles"-waarschuwing).
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
