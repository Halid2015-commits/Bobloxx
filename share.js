const fs = require("fs");
const path = require("path");
const localtunnel = require("localtunnel");

const PORT = Number(process.env.PORT) || 3000;
const LOCAL_HOST = process.env.TUNNEL_LOCAL_HOST || "127.0.0.1";
const TUNNEL_HOST = process.env.TUNNEL_HOST || undefined;
const TUNNEL_SUBDOMAIN = process.env.TUNNEL_SUBDOMAIN || undefined;
const TUNNEL_INFO_FILE = path.join(__dirname, "tunnel-info.json");

let tunnel = null;

function writeTunnelInfo(info) {
  fs.writeFileSync(TUNNEL_INFO_FILE, `${JSON.stringify(info, null, 2)}\n`);
}

function clearTunnelInfo() {
  try {
    if (fs.existsSync(TUNNEL_INFO_FILE)) {
      fs.unlinkSync(TUNNEL_INFO_FILE);
    }
  } catch {
    // Best effort cleanup only.
  }
}

async function shutdown(exitCode = 0) {
  try {
    if (tunnel) {
      await tunnel.close();
      tunnel = null;
    }
  } catch {
    // Ignore close errors on shutdown.
  } finally {
    clearTunnelInfo();
    process.exit(exitCode);
  }
}

async function main() {
  console.log(`Starting free internet share for http://${LOCAL_HOST}:${PORT}`);

  tunnel = await localtunnel({
    port: PORT,
    local_host: LOCAL_HOST,
    host: TUNNEL_HOST,
    subdomain: TUNNEL_SUBDOMAIN,
  });

  const info = {
    provider: "localtunnel",
    publicUrl: tunnel.url,
    port: PORT,
    localHost: LOCAL_HOST,
    createdAt: new Date().toISOString(),
  };

  writeTunnelInfo(info);

  console.log("");
  console.log("Bobloxx internet share is ready.");
  console.log(`Share this URL with friends: ${tunnel.url}`);
  console.log("Keep this terminal open while friends are playing.");
  console.log("The game menu should now show an Internet quick-connect row.");
  console.log("");

  tunnel.on("close", () => {
    console.log("Tunnel closed.");
    clearTunnelInfo();
  });

  tunnel.on("error", (error) => {
    console.error("Tunnel error:", error?.message || error);
  });
}

process.on("SIGINT", () => {
  console.log("Stopping internet share...");
  shutdown(0);
});

process.on("SIGTERM", () => {
  console.log("Stopping internet share...");
  shutdown(0);
});

main().catch((error) => {
  console.error("Could not start internet share:", error?.message || error);
  clearTunnelInfo();
  process.exit(1);
});
