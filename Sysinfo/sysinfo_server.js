///////////////////////////////////////////////////////////////
///                                                         ///
///  SYSINFO SERVER SCRIPT FOR FM-DX-WEBSERVER (V1.2)       ///
///                                                         ///
///  by Highpoint                last update: 04.02.26      ///
///                                                         ///
///  https://github.com/Highpoint2000/Sysinfo               ///
///                                                         ///
///////////////////////////////////////////////////////////////

// Default Configuration
const defaultConfig = {
  UpdateInterval: 1000          // Update interval in ms (default 1 second)
};

////////////////////////////////////////////////////////////////

const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');

// Integration into existing logging/config structure
const { logInfo, logError, logWarn } = require('./../../server/console');
const ConfigFilePath = path.join(__dirname, './../../plugins_configs/sysinfo.json');
const config = require('./../../config.json');

// --- Config Loading ---
function mergeConfig(defaultCfg, existingCfg) {
  const updated = {};
  for (const key in defaultCfg) {
    updated[key] = (key in existingCfg) ? existingCfg[key] : defaultCfg[key];
  }
  return updated;
}

function loadConfig(filePath) {
  let existingConfig = {};
  const dirPath = path.dirname(filePath);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  if (fs.existsSync(filePath)) {
    existingConfig = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }
  const finalConfig = mergeConfig(defaultConfig, existingConfig);
  fs.writeFileSync(filePath, JSON.stringify(finalConfig, null, 2), 'utf-8');
  return finalConfig;
}

const configPlugin = loadConfig(ConfigFilePath);
const updateInterval = configPlugin.UpdateInterval || 1000;

// --- Module Installation ---
const { execSync } = require('child_process');
const NewModules = ['systeminformation', 'ws'];

function checkAndInstallNewModules() {
  NewModules.forEach(module => {
    const modulePath = path.join(__dirname, './../../node_modules', module);
    if (!fs.existsSync(modulePath)) {
      logInfo(`[SysInfo] Module ${module} is missing. Installing...`);
      try {
        execSync(`npm install ${module}`, { stdio: 'inherit' });
        logInfo(`[SysInfo] Module ${module} installed successfully.`);
      } catch (error) {
        logError(`[SysInfo] Error installing module ${module}: ${error.message}`);
        process.exit(1);
      }
    }
  });
}
checkAndInstallNewModules();

const si = require('systeminformation');

// --- WebSocket Connection ---
const webserverPort = config.webserver.webserverPort || 8080;
const externalWsUrl = `ws://127.0.0.1:${webserverPort}`;
let ws;

function connectToWebSocket() {
  ws = new WebSocket(externalWsUrl + '/data_plugins');

  ws.on('open', () => {
    logInfo(`[SysInfo] WebSocket connected to ${externalWsUrl}/data_plugins`);
  });

  ws.on('error', (error) => logError('[SysInfo] WebSocket error:', error));

  ws.on('close', (code, reason) => {
    logWarn(`[SysInfo] Connection closed. Retry in 5s.`);
    setTimeout(connectToWebSocket, 5000);
  });
}

connectToWebSocket();

// --- Data Collection & Sending ---
async function gatherAndSend() {
  try {
    // 1. Static/Slow Data
    const osInfo = await si.osInfo();
    const time = await si.time();
    
    // 2. Dynamic Hardware Data
    const currentLoad = await si.currentLoad();
    const mem = await si.mem();
    const temp = await si.cpuTemperature();

    // 3. Network Data
    const defaultIface = await si.networkInterfaceDefault();
    const networkStats = await si.networkStats(defaultIface);
    const networkInterfaces = await si.networkInterfaces();
    
    // Find IP of default interface
    const activeInterface = networkInterfaces.find(i => i.iface === defaultIface) || networkInterfaces[0];
    const netStat = networkStats.find(i => i.iface === defaultIface) || networkStats[0];

    const payload = {
      type: 'SYSINFO',
      value: {
        platform: osInfo.platform, 
        distro: osInfo.distro,     
        hostname: osInfo.hostname,
        
        cpuLoad: currentLoad.currentLoad.toFixed(1),
        cpuTemp: temp.main ? temp.main.toFixed(1) : -1,
        
        // Detailed Core Data
        cpus: currentLoad.cpus.map((core, index) => ({
            load: core.load.toFixed(1),
            temp: (temp.cores && temp.cores[index]) ? temp.cores[index].toFixed(1) : null
        })),

        memUsed: mem.active,
        memTotal: mem.total,
        memPercent: ((mem.active / mem.total) * 100).toFixed(1),
        
        // Network Data
        netIface: activeInterface ? activeInterface.iface : 'eth0',
        netIp: activeInterface ? activeInterface.ip4 : 'unknown',
        netRx: netStat ? netStat.rx_sec : 0, // bytes per sec
        netTx: netStat ? netStat.tx_sec : 0, // bytes per sec

        uptime: time.uptime
      }
    };

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }

  } catch (error) {
    logError('[SysInfo] Error gathering data:', error);
  }
}

// Start Loop
setInterval(gatherAndSend, updateInterval);
logInfo(`[SysInfo] Plugin started. Updating every ${updateInterval}ms.`);