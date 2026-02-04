///////////////////////////////////////////////////////////////
///                                                         ///
///  SYSINFO SERVER SCRIPT FOR FM-DX-WEBSERVER (V1.1)       ///
///                                                         ///
///  by Highpoint                last update: 04.02.26      ///
///                                                         ///
///  https://github.com/Highpoint2000/Sysinfo               ///
///                                                         ///
///////////////////////////////////////////////////////////////

// Default Configuration
const defaultConfig = {
  UpdateInterval: 2000          // 2 seconds default
};

const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const { execSync, exec } = require('child_process');

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
const updateInterval = configPlugin.UpdateInterval || 2000;

// --- Module Installation ---
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
  ws.on('open', () => { logInfo(`[SysInfo] WebSocket connected`); });
  ws.on('error', (error) => logError('[SysInfo] WebSocket error:', error));
  ws.on('close', () => { setTimeout(connectToWebSocket, 5000); });
}
connectToWebSocket();

// --- Optimization Storage ---
let cachedData = {
    platform: '-', distro: '-', hostname: '-',
    cpuLoad: 0, cpus: [],
    netRx: 0, netTx: 0,
    cpuTemp: -1, coreTemps: [],
    memUsed: 0, memTotal: 0, memPercent: 0,
    diskUsed: 0, diskTotal: 0, diskPercent: 0,
    uptime: 0,
    netIp: '-', netIface: '-',
    throttled: false,
    processes: [] 
};

let defaultInterfaceName = null;
let isRaspberry = false;
let isWindows = false;

// --- 1. VERY SLOW INIT (Runs only ONCE at start) ---
async function initStaticData() {
    try {
        logInfo("[SysInfo] Initializing static data...");
        const osInfo = await si.osInfo();
        cachedData.platform = osInfo.platform;
        cachedData.distro = osInfo.distro;
        cachedData.hostname = osInfo.hostname;
        
        if (osInfo.platform === 'win32' || osInfo.platform === 'windows') {
            isWindows = true;
        }

        // Detect Raspberry Pi
        const sys = await si.system();
        if ((sys.model && sys.model.includes("Raspberry")) || osInfo.arch === 'arm') {
            isRaspberry = true;
        }
        
        // Network Interface Discovery
        defaultInterfaceName = await si.networkInterfaceDefault();
        const interfaces = await si.networkInterfaces();
        const activeInterface = interfaces.find(i => i.iface === defaultInterfaceName) || interfaces[0];
        
        if (activeInterface) {
            cachedData.netIface = activeInterface.iface;
            cachedData.netIp = activeInterface.ip4;
        }
        
        const mem = await si.mem();
        cachedData.memTotal = mem.total;
        
        logInfo(`[SysInfo] Init done. OS: ${osInfo.platform}, Interface: ${cachedData.netIface}`);
    } catch (e) {
        logError('[SysInfo] Init Error:', e);
    }
}

// --- Helper: Check RPi Throttling ---
function checkRpiThrottling() {
    if (!isRaspberry) return;
    exec('vcgencmd get_throttled', (error, stdout, stderr) => {
        if (error) return;
        try {
            const hexStr = stdout.split('=')[1];
            const val = parseInt(hexStr, 16);
            if ((val & 0x1) || (val & 0x4)) {
                cachedData.throttled = true;
            } else {
                cachedData.throttled = false;
            }
        } catch(e) {}
    });
}

// --- 2. HEAVY DATA LOOP (Runs rarely - e.g. every 20s) ---
async function updateHeavyData() {
    try {
        // CPU Temp - Advanced Fallback Logic
        const temp = await si.cpuTemperature();
        let finalTemp = -1;

        if (temp.main > 0) {
            finalTemp = temp.main;
        } else if (temp.cores && temp.cores.length > 0 && temp.cores[0] > 0) {
            // Windows often puts value in cores array
            finalTemp = temp.cores[0];
        } else if (temp.max > 0) {
            // Sometimes only max is available
            finalTemp = temp.max;
        }
        
        cachedData.cpuTemp = finalTemp > 0 ? finalTemp.toFixed(1) : -1;
        cachedData.coreTemps = temp.cores || [];

        // Memory
        const mem = await si.mem();
        cachedData.memUsed = mem.active;
        cachedData.memPercent = ((mem.active / mem.total) * 100).toFixed(1);
        
        // Disk Usage
        const fsSize = await si.fsSize();
        if (fsSize && fsSize.length > 0) {
            let root;
            if (isWindows) {
                // Windows: Look for C: or first drive
                root = fsSize.find(d => d.mount.toLowerCase() === 'c:') || fsSize[0];
            } else {
                // Linux: Look for /
                root = fsSize.find(d => d.mount === '/') || fsSize[0];
            }
            
            if (root) {
                cachedData.diskUsed = root.used;
                cachedData.diskTotal = root.size;
                cachedData.diskPercent = root.use.toFixed(1);
            }
        }

        // Processes (Top 3)
        const processes = await si.processes();
        if (processes && processes.list) {
            cachedData.processes = processes.list
                .sort((a, b) => b.cpu - a.cpu)
                .slice(0, 3)
                .map(p => ({ name: p.name, cpu: p.cpu.toFixed(1) }));
        }

        const time = await si.time();
        cachedData.uptime = time.uptime;
        
        checkRpiThrottling();
        
    } catch (e) { /* ignore */ }
}

// --- 3. LIGHT DATA LOOP (Runs often - e.g. every 2s) ---
async function updateLightData() {
    try {
        // CPU Load
        const currentLoad = await si.currentLoad();
        cachedData.cpuLoad = currentLoad.currentLoad.toFixed(1);
        cachedData.cpus = currentLoad.cpus.map((core, index) => ({
            load: core.load.toFixed(1),
            temp: (cachedData.coreTemps && cachedData.coreTemps[index]) ? cachedData.coreTemps[index].toFixed(1) : null
        }));

        // Network Traffic
        if (defaultInterfaceName) {
            const stats = await si.networkStats(defaultInterfaceName);
            if (stats && stats.length > 0) {
                cachedData.netRx = stats[0].rx_sec;
                cachedData.netTx = stats[0].tx_sec;
            }
        }
        
        sendPayload();
    } catch (e) { /* ignore */ }
}

function sendPayload() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'SYSINFO',
            value: cachedData
        }));
    }
}

// --- Start Sequence ---
initStaticData().then(() => {
    setInterval(updateLightData, updateInterval);
    setInterval(updateHeavyData, 20000); 
    
    updateHeavyData();
    updateLightData();
});