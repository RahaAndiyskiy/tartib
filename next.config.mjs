import withPWA from "next-pwa";

const isDevelopment = process.env.NODE_ENV === "development";

const pwaConfig = withPWA({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: isDevelopment
});

const nextConfig = {
  reactStrictMode: true,
  output: "standalone"
};

export default pwaConfig(nextConfig);
