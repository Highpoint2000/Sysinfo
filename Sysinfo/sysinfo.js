(() => {
  ////////////////////////////////////////////////////////////////
  ///                                                          ///
  ///  SYSINFO CLIENT SCRIPT FOR FM-DX-WEBSERVER (V1.1)        ///
  ///                                                          ///
  ///  by Highpoint                last update: 04.02.26       ///
  ///                                                          ///
  ///  https://github.com/Highpoint2000/Sysinfo                ///
  ///                                                          ///
  ////////////////////////////////////////////////////////////////
 
  // ------------- Admin Configuration ----------------
  const RestrictButtonToAdmin = false; 
  
  // ------------- Update Configuration ----------------
  const pluginSetupOnlyNotify = true;
  const CHECK_FOR_UPDATES = true;

  ///////////////////////////////////////////////////////////////

  // Plugin metadata
  const pluginVersion = '1.1';
  const pluginName = "SysInfo";
  const pluginHomepageUrl = "https://github.com/Highpoint2000/Sysinfo/releases";
  
  // RAW URL to the JS file for version checking
  const pluginUpdateUrl = "https://raw.githubusercontent.com/highpoint2000/Sysinfo/main/Sysinfo/sysinfo.js";

  // WebSocket Setup
  const url = new URL(window.location.href);
  const host = url.hostname;
  const path = url.pathname.replace(/setup/g, '');
  const port = url.port || (url.protocol === 'https:' ? '443' : '80');
  const proto = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const WS_URL = `${proto}//${host}:${port}${path}data_plugins`;
  let ws = null;

  // Toggle state for CPU cores
  let showCores = false;
  
  // Storage for last received data to enable instant UI updates
  let lastData = null;
  
  // Admin State
  let isAdmin = false;

  // ------------------------------------------------------------------
  // Check Admin Status
  // ------------------------------------------------------------------
  function checkAdminMode() {
      const bodyText = document.body.textContent || document.body.innerText;
      const isAdminLoggedIn =
          bodyText.includes("You are logged in as an administrator.") ||
          bodyText.includes("You are logged in as an adminstrator.");
      
      isAdmin = !!isAdminLoggedIn;
      console.log(`[${pluginName}] Admin Mode: ${isAdmin}`);
  }
  checkAdminMode();

  // ------------------------------------------------------------------
  // Fallback for sendToast()
  // ------------------------------------------------------------------
  if (typeof sendToast !== "function") {
    window.sendToast = function (cls, src, txt) {
      console.log(`[TOAST-Fallback] ${src}: ${cls} → ${txt}`);
    };
  }

  // ------------------------------------------------------------------
  // Update Check Logic (Robust Version)
  // ------------------------------------------------------------------
  // ------------------------------------------------------------------
  // Update Check Logic (Original MetricsMonitor Style)
  // ------------------------------------------------------------------
  function checkUpdate(setupOnly, pluginName, urlUpdateLink, urlFetchLink) {
    const isSetupPath = (window.location.pathname || "/").indexOf("/setup") >= 0;
    const ver = typeof pluginVersion !== "undefined" ? pluginVersion : "Unknown";

    // Add timestamp to prevent caching
    const cleanUrl = urlFetchLink + '?t=' + new Date().getTime();

    fetch(cleanUrl, { cache: "no-store" })
        .then((r) => r.text())
        .then((txt) => {
            let remoteVer = "Unknown";
            const match = txt.match(/const\s+pluginVersion\s*=\s*['"]([^'"]+)['"]/);
            if (match) remoteVer = match[1];

            if (remoteVer !== "Unknown" && remoteVer !== ver) {
                console.log(`[${pluginName}] Update available: ${ver} -> ${remoteVer}`);
                
                if (!setupOnly || isSetupPath) {
                    // 1. Add Text to Plugin Settings
                    const settings = document.getElementById("plugin-settings");
                    if (settings) {
                        if (!settings.innerHTML.includes(urlUpdateLink)) {
                             settings.innerHTML += `<br><a href="${urlUpdateLink}" target="_blank">[${pluginName}] Update: ${ver} -> ${remoteVer}</a>`;
                        }
                    }
                    
                    // 2. Add Red Dot to Navigation Icon
                    const updateIcon =
                        document.querySelector(".wrapper-outer #navigation .sidenav-content .fa-puzzle-piece") ||
                        document.querySelector(".wrapper-outer .sidenav-content") ||
                        document.querySelector(".sidenav-content");
                    
                    if (updateIcon) {
                        if (!updateIcon.querySelector(`.${pluginName}-update-dot`)) {
                            const redDot = document.createElement("span");
                            redDot.classList.add(`${pluginName}-update-dot`);
                            redDot.style.cssText = `
                                display: block;
                                width: 12px;
                                height: 12px;
                                border-radius: 50%;
                                background-color: #FE0830;
                                margin-left: 82px;
                                margin-top: -12px;
                            `;
                            updateIcon.appendChild(redDot);
                        }
                    }
                }
            }
        })
        .catch((e) => { console.warn(`[${pluginName}] Update check failed`, e); });
  }

  if (CHECK_FOR_UPDATES) checkUpdate(pluginSetupOnlyNotify, pluginName, pluginHomepageUrl, pluginUpdateUrl);

  // --- WebSocket Connection ---
  async function setupWebSocket() {
    if (!ws || ws.readyState === WebSocket.CLOSED) {
      try {
        ws = new WebSocket(WS_URL);
        ws.addEventListener('open', () => console.log(`[${pluginName}] WebSocket connected`));
        ws.addEventListener('message', handleMessage);
        ws.addEventListener('close', () => setTimeout(setupWebSocket, 5000));
        ws.addEventListener('error', (e) => console.error(`[${pluginName}] WebSocket error`, e));
      } catch (err) {
        console.error(`[${pluginName}] WS setup Error`, err);
        setTimeout(setupWebSocket, 5000);
      }
    }
  }

  // --- Handle Data ---
  function handleMessage(evt) {
    try {
      const msg = JSON.parse(evt.data);
      if (msg.type === 'SYSINFO' && msg.value) {
        lastData = msg.value; // Store data for instant toggling
        updateUI(msg.value);
      }
    } catch (e) {
      console.error('SysInfo parse error', e);
    }
  }

  function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
  
  function formatSpeed(bytesPerSec) {
      return formatBytes(bytesPerSec) + '/s';
  }

  function formatUptime(seconds) {
    const d = Math.floor(seconds / (3600*24));
    const h = Math.floor(seconds % (3600*24) / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    return `${d}d ${h}h ${m}m`;
  }

  // Helper for Colors (Green -> Orange -> Red)
  function getColorForPercentage(pct, warnThreshold, critThreshold) {
      if (pct >= critThreshold) return '#ff5555'; // Red
      if (pct >= warnThreshold) return '#ffa500'; // Orange
      return '#4caf50'; // Green (default)
  }

  function updateUI(data) {
    if (!data) return;

    // RPi Throttling Warning
    const warnIcon = document.getElementById('sysinfo-warn');
    if (data.throttled) {
        warnIcon.style.display = 'block';
    } else {
        warnIcon.style.display = 'none';
    }

    // OS & Host
    document.getElementById('sys-os').textContent = `${data.distro}`;
    document.getElementById('sys-host').textContent = data.hostname;
    document.getElementById('sys-uptime').textContent = formatUptime(data.uptime);

    // Total CPU Load
    const cpuVal = parseFloat(data.cpuLoad);
    document.getElementById('sys-cpu-val').textContent = `${data.cpuLoad}%`;
    document.getElementById('sys-cpu-bar').style.width = `${data.cpuLoad}%`;
    document.getElementById('sys-cpu-bar').style.backgroundColor = getColorForPercentage(cpuVal, 60, 85);

    // Total CPU Temp
    const tempSection = document.getElementById('sys-temp-section');
    if (data.cpuTemp != -1) {
        // Show section if valid
        tempSection.style.display = 'block';
        
        const temp = parseFloat(data.cpuTemp);
        document.getElementById('sys-temp-val').textContent = `${temp.toFixed(1)}°C`;
        
        // Scale temp visually: 0-85°C
        let tempPct = (temp / 85) * 100;
        if (tempPct > 100) tempPct = 100;
        document.getElementById('sys-temp-bar').style.width = `${tempPct}%`;
        
        // Colors: <60 (Green), 60-75 (Orange), >75 (Red)
        const tempBar = document.getElementById('sys-temp-bar');
        tempBar.style.backgroundColor = getColorForPercentage(temp, 60, 75);
    } else {
        // Hide section on Windows (or if no sensor found)
        tempSection.style.display = 'none';
    }

    // Memory Usage
    const memVal = parseFloat(data.memPercent);
    document.getElementById('sys-mem-val').textContent = `${data.memPercent}%`;
    document.getElementById('sys-mem-text').textContent = `${formatBytes(data.memUsed)} / ${formatBytes(data.memTotal)}`;
    document.getElementById('sys-mem-bar').style.width = `${data.memPercent}%`;
    
    // Colors: <75 (Green), 75-90 (Orange), >90 (Red)
    const memBar = document.getElementById('sys-mem-bar');
    memBar.style.backgroundColor = getColorForPercentage(memVal, 75, 90);

    // Disk Usage
    const diskVal = parseFloat(data.diskPercent);
    document.getElementById('sys-disk-val').textContent = `${data.diskPercent}%`;
    document.getElementById('sys-disk-text').textContent = `${formatBytes(data.diskUsed)} / ${formatBytes(data.diskTotal)}`;
    document.getElementById('sys-disk-bar').style.width = `${data.diskPercent}%`;
    
    // Colors: <80 (Green), 80-95 (Orange), >95 (Red)
    const diskBar = document.getElementById('sys-disk-bar');
    diskBar.style.backgroundColor = getColorForPercentage(diskVal, 80, 95);
    
    // Dynamic Label (C: or /)
    // If distro is windows, assume C: if not explicitly provided otherwise by backend, 
    // but usually user just wants to see "Disk"
    let diskLabel = "Disk";
    if (data.platform === "win32" || data.platform === "windows") diskLabel = "Disk (C:)";
    else diskLabel = "Disk:";
    document.getElementById('sys-disk-label').textContent = diskLabel;

    // Core Data
    const coresContainer = document.getElementById('sys-cores-container');
    if (showCores && data.cpus && data.cpus.length > 0) {
        coresContainer.style.display = 'block';
        coresContainer.innerHTML = ''; 

        data.cpus.forEach((core, i) => {
            const row = document.createElement('div');
            row.className = 'sys-core-row';
            
            const tempStr = core.temp ? `<span style="color:#aaa; font-size:10px; margin-right:5px;">${core.temp}°C</span>` : '';
            const coreLoad = parseFloat(core.load);
            // Cores: <60 (Green), 60-85 (Orange), >85 (Red)
            const color = getColorForPercentage(coreLoad, 60, 85);

            row.innerHTML = `
                <div style="display:flex; justify-content:space-between; font-size:10px; margin-bottom:1px;">
                    <span style="color:#aaa;">Core ${i}</span>
                    <span>${tempStr} <span style="color:#fff;">${core.load}%</span></span>
                </div>
                <div class="sys-bar-bg" style="height:4px; background:#222;"><div class="sys-bar-fill" style="width:${core.load}%; background:${color};"></div></div>
            `;
            coresContainer.appendChild(row);
        });
    } else {
        coresContainer.style.display = 'none';
    }
    
    // Network Data
    const netSection = document.getElementById('sys-net-section');
    const netIpElement = document.getElementById('sys-net-ip');
    
    if (netSection) {
        netSection.style.display = 'block';
        document.getElementById('sys-net-name').textContent = `${data.netIface}`;
        document.getElementById('sys-net-down').innerHTML = `<i class="fas fa-arrow-down" style="font-size:10px"></i> ${formatSpeed(data.netRx)}`;
        document.getElementById('sys-net-up').innerHTML = `<i class="fas fa-arrow-up" style="font-size:10px"></i> ${formatSpeed(data.netTx)}`;
        
        // Only show IP address if user is Admin
        if (isAdmin) {
            netIpElement.style.display = 'block';
            netIpElement.textContent = data.netIp || '-';
        } else {
            netIpElement.style.display = 'none';
        }
    }
  }

  // --- Create UI Overlay ---
  const style = document.createElement('style');
  style.innerHTML = `
    #sysinfo-overlay { 
      position:fixed; display:none; width: 220px;
      background-color: var(--color-1); color:#fff;
      font-family: sans-serif; border-radius:8px;
      z-index:1500; cursor:move; user-select:none;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
      border: 1px solid #444; font-size: 13px;
    }
    #sysinfo-header {
      background: rgba(255,255,255,0.1); padding: 8px 10px;
      border-bottom: 1px solid #444; font-weight: bold;
      border-radius: 8px 8px 0 0; display:flex; justify-content:space-between; align-items:center;
    }
    #sysinfo-close {
        cursor: pointer; font-weight: bold; color: #ccc; font-size: 18px; line-height: 1; padding: 0 4px; margin-right: -6px;
    }
    #sysinfo-close:hover { color: #fff; }
    
    #sysinfo-warn {
        display:none; color: #ff5555; margin-right: 10px; font-size: 14px; animation: sys-blink 1s infinite;
    }
    @keyframes sys-blink { 50% { opacity: 0.5; } }
    
    #sysinfo-content { padding: 10px; display:flex; flex-direction:column; gap:8px; }
    .sys-row { display:flex; justify-content:space-between; margin-bottom: 2px;}
    .sys-label { color: #aaa; }
    .sys-val { color: #fff; font-weight:bold; }
    
    .sys-bar-bg {
      width: 100%; height: 6px; background: #333; border-radius: 3px; overflow: hidden; margin-top:2px;
    }
    .sys-bar-fill {
      height: 100%; width: 0%; background: #4caf50; transition: width 0.5s ease;
    }
    
    .sys-toggle {
        cursor: pointer; display:inline-block; transition: transform 0.3s; color: #4da6ff;
    }
    .sys-toggle:hover { color: #fff; }
    .sys-toggle.open { transform: rotate(180deg); }
    
    #sys-cores-container {
        background: rgba(0,0,0,0.2);
        padding: 5px;
        border-radius: 4px;
        margin-top: 5px;
        display: none;
    }
    .sys-core-row { margin-bottom: 4px; }
    
    .sys-net-box {
        display:flex; justify-content: space-between; font-size:11px;
    }
  `;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.id = 'sysinfo-overlay';
  overlay.innerHTML = `
    <div id="sysinfo-header">
        <div style="display:flex; align-items:center;">
            <span>System Monitor</span>
            <i id="sysinfo-warn" class="fas fa-bolt" title="Undervoltage / Throttling detected!"></i>
        </div>
        <span id="sysinfo-close" title="Close">&times;</span>
    </div>
    <div id="sysinfo-content">
      
      <div class="sys-group">
        <div class="sys-row"><span class="sys-label">Host:</span> <span id="sys-host" class="sys-val">-</span></div>
        <div class="sys-row"><span class="sys-label">OS:</span> <span id="sys-os" class="sys-val" style="font-size:11px; text-align:right;">-</span></div>
        <div class="sys-row"><span class="sys-label">Uptime:</span> <span id="sys-uptime" class="sys-val">-</span></div>
      </div>

      <hr style="border:0; border-top:1px solid #444; width:100%; margin: 5px 0;">

      <!-- CPU Section -->
      <div class="sys-group">
        <div class="sys-row">
            <span>
                <i id="sys-cpu-toggle" class="fas fa-caret-down sys-toggle" title="Show/Hide Cores"></i>
                <span class="sys-label" style="margin-left:4px;">CPU Load:</span>
            </span> 
            <span id="sys-cpu-val" class="sys-val">0%</span>
        </div>
        <div class="sys-bar-bg"><div id="sys-cpu-bar" class="sys-bar-fill"></div></div>
        
        <div id="sys-cores-container"></div>
      </div>

      <!-- CPU Temp Section (ID added for toggling) -->
      <div id="sys-temp-section" class="sys-group" style="margin-top:5px;">
        <div class="sys-row">
            <span class="sys-label">CPU Temp:</span> 
            <span id="sys-temp-val" class="sys-val">0°C</span>
        </div>
        <div class="sys-bar-bg"><div id="sys-temp-bar" class="sys-bar-fill" style="background:#2196F3"></div></div>
      </div>

      <!-- RAM Section -->
      <div class="sys-group" style="margin-top:5px;">
        <div class="sys-row">
            <span class="sys-label">RAM:</span> 
            <span id="sys-mem-val" class="sys-val">0%</span>
        </div>
        <div class="sys-bar-bg"><div id="sys-mem-bar" class="sys-bar-fill" style="background:#2196F3"></div></div>
        <div style="text-align:right; font-size:10px; color:#888; margin-top:2px;" id="sys-mem-text">- / -</div>
      </div>

      <!-- Disk Section -->
      <div class="sys-group" style="margin-top:5px;">
        <div class="sys-row">
            <span id="sys-disk-label" class="sys-label">Disk:</span> 
            <span id="sys-disk-val" class="sys-val">0%</span>
        </div>
        <div class="sys-bar-bg"><div id="sys-disk-bar" class="sys-bar-fill" style="background:#9c27b0"></div></div>
        <div style="text-align:right; font-size:10px; color:#888; margin-top:2px;" id="sys-disk-text">- / -</div>
      </div>
      
      <!-- Network Section -->
      <div id="sys-net-section">
          <hr style="border:0; border-top:1px solid #444; width:100%; margin: 5px 0;">
          <div class="sys-group">
            <div class="sys-row">
                <span class="sys-label">Network:</span> 
                <span id="sys-net-name" class="sys-val" style="color:#4da6ff">-</span>
            </div>
            <div style="font-size:11px; color:#ccc; margin-bottom:4px;" id="sys-net-ip">-</div>
            
            <div class="sys-net-box">
                <span style="color:white" id="sys-net-down">↓ 0 B/s</span>
                <span style="color:white" id="sys-net-up">↑ 0 B/s</span>
            </div>
          </div>
      </div>

    </div>
  `;
  document.body.appendChild(overlay);

  // Close Button Logic
  document.getElementById('sysinfo-close').addEventListener('click', () => {
      $('#sysinfo-overlay').stop(true, true).fadeOut(400);
      const btn = document.getElementById('SysInfo-on-off');
      if (btn) btn.classList.remove('active');
  });

  // Toggle Logic with instant update
  const toggleBtn = document.getElementById('sys-cpu-toggle');
  toggleBtn.addEventListener('click', () => {
      showCores = !showCores;
      if (showCores) toggleBtn.classList.add('open');
      else toggleBtn.classList.remove('open');
      if (lastData) updateUI(lastData);
  });

  // Position defaults
  const posX = localStorage.getItem('sysinfoLeft') || '20px';
  const posY = localStorage.getItem('sysinfoTop') || '240px'; 
  overlay.style.left = posX;
  overlay.style.top = posY;

  // --- Drag Logic ---
  (function () {
    let dragging = false, sx, sy, ox, oy;
    overlay.addEventListener('mousedown', e => {
      if (e.target.id === 'sys-cpu-toggle' || e.target.id === 'sysinfo-close') return;
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      const r = overlay.getBoundingClientRect();
      ox = r.left; oy = r.top;
      e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      overlay.style.left = ox + (e.clientX - sx) + 'px';
      overlay.style.top = oy + (e.clientY - sy) + 'px';
    });
    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      localStorage.setItem('sysinfoLeft', overlay.style.left);
      localStorage.setItem('sysinfoTop', overlay.style.top);
    });
  })();

  // --- Toolbar Button ---
  (function () {
    if (RestrictButtonToAdmin && !isAdmin) return;

    const btnId = 'SysInfo-on-off';
    let active = false, found = false;
    const obs = new MutationObserver((_, o) => {
      if (typeof addIconToPluginPanel === 'function') {
        found = true; o.disconnect();
        addIconToPluginPanel(btnId, 'SysInfo', 'solid', 'microchip', `Plugin Version: ${pluginVersion}`);
        
        const btnObs = new MutationObserver((_, o2) => {
          const $btn = $(`#${btnId}`);
          $btn.addClass("hide-phone bg-color-2");
          if ($btn.length) {
            o2.disconnect();
            const css = `
              #${btnId}:hover { color: var(--color-5); filter: brightness(120%); }
              #${btnId}.active { background-color: var(--color-2)!important; filter: brightness(120%); }
            `;
            $("<style>").prop("type", "text/css").html(css).appendTo("head");
            
            $btn.on('click', () => {
              active = !active;
              const overlayVisible = $('#sysinfo-overlay').is(':visible');
              if (!overlayVisible) {
                  $btn.addClass('active');
                  $('#sysinfo-overlay').stop(true, true).fadeIn(400);
              } else {
                  $btn.removeClass('active');
                  $('#sysinfo-overlay').stop(true, true).fadeOut(400);
              }
            });
          }
        });
        btnObs.observe(document.body, { childList: true, subtree: true });
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { if (!found) obs.disconnect(); }, 10000);
  })();

  setupWebSocket();

})();