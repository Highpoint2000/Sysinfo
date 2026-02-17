///////////////////////////////////////////////////////////////
///                                                         ///
///  SYSINFO SERVER SCRIPT FOR FM-DX-WEBSERVER (V1.3)       ///
///                                                         ///
///  by Highpoint                last update: 17.02.26      ///
///                                                         ///
///  https://github.com/Highpoint2000/Sysinfo               ///
///                                                         ///
///////////////////////////////////////////////////////////////

const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const { execSync, exec } = require('child_process');
const os = require('os');

// Integration into existing logging/config structure
const { logInfo, logError, logWarn } = require('./../../server/console');
const ConfigFilePath = path.join(__dirname, './../../plugins_configs/sysinfo.json');
const ClientScriptPath = path.join(__dirname, 'sysinfo.js');
const config = require('./../../config.json');

// Default Configuration
const defaultConfig = {
  UpdateInterval: 2000,         // 2 seconds default
  RestrictButtonToAdmin: true  // Button visibility restriction
};

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
    try {
        existingConfig = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (e) {
        logError('[SysInfo] Error reading config file. Using defaults.');
    }
  }
  const finalConfig = mergeConfig(defaultConfig, existingConfig);
  fs.writeFileSync(filePath, JSON.stringify(finalConfig, null, 2), 'utf-8');
  return finalConfig;
}

const configPlugin = loadConfig(ConfigFilePath);
const updateInterval = configPlugin.UpdateInterval || 2000;

// --- Inject Config into Client Script ---
function injectConfigToClientScript() {
    try {
        if (!fs.existsSync(ClientScriptPath)) {
            logError(`[SysInfo] Client script not found at ${ClientScriptPath}`);
            return;
        }

        let content = fs.readFileSync(ClientScriptPath, 'utf8');
        
        // Regex to find: const RestrictButtonToAdmin = ...;
        // We replace it with the value from the config
        const restrictVal = configPlugin.RestrictButtonToAdmin;
        const newContent = content.replace(
            /const\s+RestrictButtonToAdmin\s*=\s*(true|false);/, 
            `const RestrictButtonToAdmin = ${restrictVal};`
        );

        if (content !== newContent) {
            fs.writeFileSync(ClientScriptPath, newContent, 'utf8');
            logInfo(`[SysInfo] Updated client script with RestrictButtonToAdmin = ${restrictVal}`);
        }
    } catch (e) {
        logError(`[SysInfo] Failed to inject config into client script: ${e.message}`);
    }
}

// Run injection immediately
injectConfigToClientScript();


// --- Module Installation ---
const NewModules = ['node-os-utils', 'ws'];
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
      }
    }
  });
}
checkAndInstallNewModules();

// --- Safe Module Loading with Fallback ---
let osUtils = null;
let useNativeAPIs = false;

try {
  osUtils = require('node-os-utils');
  logInfo('[SysInfo] node-os-utils loaded successfully');
} catch (error) {
  logWarn('[SysInfo] node-os-utils not available, using native Node.js APIs');
  useNativeAPIs = true;
}

// --- WebSocket Connection ---
const webserverPort = config.webserver.webserverPort || 8080;
const externalWsUrl = `ws://127.0.0.1:${webserverPort}`;
let ws;

function connectToWebSocket() {
  ws = new WebSocket(externalWsUrl + '/data_plugins');
  ws.on('open', () => { logInfo(`[SysInfo] WebSocket connected (${useNativeAPIs ? 'Native' : 'Optimized'})`); });
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
    throttled: false
};

let isRaspberry = false;
let isWindows = false;
let lastNetStats = { rx: 0, tx: 0, time: Date.now() };

// --- Native CPU Tracking (Fallback) ---
let previousCpuUsage = null;

function getCpuUsageNative() {
    const currentCpus = os.cpus();
    
    if (!previousCpuUsage) {
        previousCpuUsage = currentCpus;
        return 0;
    }
    
    let totalIdle = 0, totalTick = 0;
    
    for (let i = 0; i < currentCpus.length; i++) {
        const current = currentCpus[i].times;
        const previous = previousCpuUsage[i].times;
        
        const currentTotal = Object.values(current).reduce((a, b) => a + b, 0);
        const previousTotal = Object.values(previous).reduce((a, b) => a + b, 0);
        
        const totalDiff = currentTotal - previousTotal;
        const idleDiff = current.idle - previous.idle;
        
        totalTick += totalDiff;
        totalIdle += idleDiff;
    }
    
    previousCpuUsage = currentCpus;
    
    const usage = 100 - (100 * totalIdle / totalTick);
    return Math.max(0, Math.min(100, usage)); // Clamp 0-100
}

// --- 1. VERY SLOW INIT (Runs only ONCE at start) ---
async function initStaticData() {
    try {
        logInfo("[SysInfo] Initializing static data...");
        
        cachedData.platform = os.platform();
        cachedData.hostname = os.hostname();
        cachedData.distro = `${os.type()} ${os.release()}`;
        
        isWindows = cachedData.platform === 'win32';
        
        // Detect Raspberry Pi
        if (os.arch().includes('arm') || os.arch().includes('aarch')) {
            isRaspberry = true;
        }
        
        // Network Interface Discovery (lightweight)
        const networkInterfaces = os.networkInterfaces();
        for (const [name, interfaces] of Object.entries(networkInterfaces)) {
            const ipv4 = interfaces.find(i => i.family === 'IPv4' && !i.internal);
            if (ipv4) {
                cachedData.netIface = name;
                cachedData.netIp = ipv4.address;
                break;
            }
        }
        
        // Total Memory (instant)
        cachedData.memTotal = os.totalmem();
        
        // Initialize CPU tracking for native mode
        if (useNativeAPIs) {
            previousCpuUsage = os.cpus();
        }
        
        logInfo(`[SysInfo] Init done. OS: ${cachedData.platform}, Interface: ${cachedData.netIface}`);
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

// --- CPU Temperature (Optimized for Windows) ---
async function getCpuTemp() {
    if (isWindows) {
        // Windows: Use WMI directly (much faster than PowerShell)
        return new Promise((resolve) => {
            exec('wmic /namespace:\\\\root\\wmi PATH MSAcpi_ThermalZoneTemperature get CurrentTemperature', 
                { timeout: 2000 }, 
                (error, stdout) => {
                    if (error) {
                        resolve(-1);
                        return;
                    }
                    try {
                        const lines = stdout.trim().split('\n');
                        if (lines.length > 1) {
                            const kelvin = parseInt(lines[1].trim());
                            const celsius = (kelvin / 10) - 273.15;
                            resolve(celsius > 0 && celsius < 150 ? celsius.toFixed(1) : -1);
                        } else {
                            resolve(-1);
                        }
                    } catch (e) {
                        resolve(-1);
                    }
                }
            );
        });
    } else if (isRaspberry) {
        // Raspberry Pi: vcgencmd
        return new Promise((resolve) => {
            exec('vcgencmd measure_temp', (error, stdout) => {
                if (error) {
                    resolve(-1);
                    return;
                }
                try {
                    const temp = parseFloat(stdout.split('=')[1]);
                    resolve(temp > 0 ? temp.toFixed(1) : -1);
                } catch (e) {
                    resolve(-1);
                }
            });
        });
    } else {
        // Linux: Read thermal zone
        return new Promise((resolve) => {
            exec('cat /sys/class/thermal/thermal_zone0/temp', (error, stdout) => {
                if (error) {
                    resolve(-1);
                    return;
                }
                try {
                    const temp = parseInt(stdout) / 1000;
                    resolve(temp > 0 ? temp.toFixed(1) : -1);
                } catch (e) {
                    resolve(-1);
                }
            });
        });
    }
}

// --- Get Disk Usage (Native Fallback) ---
async function getDiskUsage() {
    if (useNativeAPIs || !osUtils) {
        // Native fallback with exec
        return new Promise((resolve) => {
            if (isWindows) {
                exec('wmic logicaldisk where "DeviceID=\'C:\'" get Size,FreeSpace', (error, stdout) => {
                    if (error) {
                        resolve({ used: 0, total: 0, percent: 0 });
                        return;
                    }
                    try {
                        const lines = stdout.trim().split('\n');
                        if (lines.length > 1) {
                            const parts = lines[1].trim().split(/\s+/);
                            const free = parseInt(parts[0]);
                            const total = parseInt(parts[1]);
                            const used = total - free;
                            const percent = ((used / total) * 100).toFixed(1);
                            resolve({ used, total, percent });
                        } else {
                            resolve({ used: 0, total: 0, percent: 0 });
                        }
                    } catch (e) {
                        resolve({ used: 0, total: 0, percent: 0 });
                    }
                });
            } else {
                exec('df -B1 /', (error, stdout) => {
                    if (error) {
                        resolve({ used: 0, total: 0, percent: 0 });
                        return;
                    }
                    try {
                        const lines = stdout.trim().split('\n');
                        if (lines.length > 1) {
                            const parts = lines[1].trim().split(/\s+/);
                            const total = parseInt(parts[1]);
                            const used = parseInt(parts[2]);
                            const percent = parseFloat(parts[4]);
                            resolve({ used, total, percent: percent.toFixed(1) });
                        } else {
                            resolve({ used: 0, total: 0, percent: 0 });
                        }
                    } catch (e) {
                        resolve({ used: 0, total: 0, percent: 0 });
                    }
                });
            }
        });
    } else {
        try {
            const diskInfo = await osUtils.drive.info();
            return {
                used: Math.round(diskInfo.usedGb * 1024 * 1024 * 1024),
                total: Math.round(diskInfo.totalGb * 1024 * 1024 * 1024),
                percent: diskInfo.usedPercentage.toFixed(1)
            };
        } catch (e) {
            return { used: 0, total: 0, percent: 0 };
        }
    }
}

// --- 2. HEAVY DATA LOOP (Runs rarely - e.g. every 20s) ---
async function updateHeavyData() {
    try {
        // CPU Temperature
        cachedData.cpuTemp = await getCpuTemp();
        cachedData.coreTemps = [];
        
        // Disk Usage
        const diskData = await getDiskUsage();
        cachedData.diskUsed = diskData.used;
        cachedData.diskTotal = diskData.total;
        cachedData.diskPercent = diskData.percent;
        
        // Uptime (instant)
        cachedData.uptime = os.uptime();
        
        // RPi Throttling Check
        checkRpiThrottling();
        
    } catch (e) {
        logError('[SysInfo] Heavy data error:', e);
    }
}

// --- 3. LIGHT DATA LOOP (Runs often - e.g. every 2s) ---
async function updateLightData() {
    try {
        // CPU Load
        let cpuUsage = 0;
        
        if (useNativeAPIs || !osUtils) {
            cpuUsage = getCpuUsageNative();
        } else {
            try {
                cpuUsage = await osUtils.cpu.usage();
            } catch (e) {
                logWarn('[SysInfo] node-os-utils CPU failed, switching to native');
                useNativeAPIs = true;
                cpuUsage = getCpuUsageNative();
            }
        }
        
        cachedData.cpuLoad = cpuUsage.toFixed(1);
        
        // Per-Core CPU Load
        const cpuCount = os.cpus().length;
        cachedData.cpus = [];
        for (let i = 0; i < cpuCount; i++) {
            cachedData.cpus.push({
                load: cpuUsage.toFixed(1),
                temp: (cachedData.coreTemps && cachedData.coreTemps[i]) ? cachedData.coreTemps[i].toFixed(1) : null
            });
        }
        
        // Memory (Native is faster anyway)
        const freeMem = os.freemem();
        const totalMem = os.totalmem();
        cachedData.memUsed = totalMem - freeMem;
        cachedData.memPercent = ((cachedData.memUsed / totalMem) * 100).toFixed(1);
        
        // Network Traffic
        if (!useNativeAPIs && osUtils) {
            try {
                const netInfo = await osUtils.netstat.inOut();
                const now = Date.now();
                const timeDiff = (now - lastNetStats.time) / 1000;
                
                if (timeDiff > 0 && lastNetStats.rx > 0) {
                    const currentRx = netInfo.total.inputMb * 1024 * 1024;
                    const currentTx = netInfo.total.outputMb * 1024 * 1024;
                    
                    cachedData.netRx = Math.round((currentRx - lastNetStats.rx) / timeDiff);
                    cachedData.netTx = Math.round((currentTx - lastNetStats.tx) / timeDiff);
                    
                    lastNetStats = { rx: currentRx, tx: currentTx, time: now };
                } else {
                    lastNetStats = {
                        rx: netInfo.total.inputMb * 1024 * 1024,
                        tx: netInfo.total.outputMb * 1024 * 1024,
                        time: now
                    };
                }
            } catch (e) {
                // Netstat failed, ignore
            }
        }
        
        sendPayload();
    } catch (e) {
        logError('[SysInfo] Light data error:', e);
    }
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