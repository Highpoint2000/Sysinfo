(() => {
  ////////////////////////////////////////////////////////////////
  ///                                                          ///
  ///  SYSINFO CLIENT SCRIPT FOR FM-DX-WEBSERVER (V1.0)        ///
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
  const pluginVersion = '1.0';
  const pluginName = "SysInfo";
  const pluginHomepageUrl = "https://github.com/Highpoint2000/Sysinfo/releases";
  const pluginUpdateUrl = "https://raw.githubusercontent.com/highpoint2000/Sysinfo/main/SysInfo/sysinfo.js";

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
  // Update Check Logic
  // ------------------------------------------------------------------
  function checkUpdate(setupOnly, pluginName, urlUpdateLink, urlFetchLink) {
    if (setupOnly && window.location.pathname !== '/setup') return;

    let pluginVersionCheck = typeof pluginVersion !== 'undefined' ? pluginVersion : typeof plugin_version !== 'undefined' ? plugin_version : typeof PLUGIN_VERSION !== 'undefined' ? PLUGIN_VERSION : 'Unknown';

    async function fetchFirstLine() {
      const urlCheckForUpdate = urlFetchLink;
      try {
        const response = await fetch(urlCheckForUpdate);
        if (!response.ok) {
          throw new Error(`[${pluginName}] update check HTTP error! status: ${response.status}`);
        }
        const text = await response.text();
        const lines = text.split('\n');
        let version;
        
        if (lines.length > 2) {
          const versionLine = lines.find(line => line.includes("const pluginVersion =") || line.includes("const plugin_version =") || line.includes("const PLUGIN_VERSION ="));
          if (versionLine) {
            const match = versionLine.match(/const\s+(?:pluginVersion|plugin_version|PLUGIN_VERSION)\s*=\s*['"]([^'"]+)['"]/);
            if (match) version = match[1];
          }
        }
        if (!version) {
          const firstLine = lines[0].trim();
          version = /^\d/.test(firstLine) ? firstLine : "Unknown";
        }
        return version;
      } catch (error) {
        console.error(`[${pluginName}] error fetching file:`, error);
        return null;
      }
    }

    fetchFirstLine().then(newVersion => {
      if (newVersion && newVersion !== pluginVersionCheck) {
        console.log(`[${pluginName}] Update available`);
        setupNotify(pluginVersionCheck, newVersion, pluginName, urlUpdateLink);
      }
    });

    function setupNotify(pluginVersionCheck, newVersion, pluginName, urlUpdateLink) {
      if (window.location.pathname === '/setup') {
        const pluginSettings = document.getElementById('plugin-settings');
        if (pluginSettings) {
          const currentText = pluginSettings.textContent.trim();
          const newText = `<a href="${urlUpdateLink}" target="_blank">[${pluginName}] Update available: ${pluginVersionCheck} --> ${newVersion}</a><br>`;
          if (currentText === 'No plugin settings are available.') {
            pluginSettings.innerHTML = newText;
          } else {
            pluginSettings.innerHTML += ' ' + newText;
          }
        }
        const updateIcon = document.querySelector('.wrapper-outer #navigation .sidenav-content .fa-puzzle-piece') || document.querySelector('.wrapper-outer .sidenav-content') || document.querySelector('.sidenav-content');
        if (updateIcon) {
            const redDot = document.createElement('span');
            redDot.style.cssText = "display:block;width:12px;height:12px;border-radius:50%;background-color:#FE0830;margin-left:82px;margin-top:-12px;";
            updateIcon.appendChild(redDot);
        }
      }
    }
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

  function updateUI(data) {
    if (!data) return;

    // OS & Host
    document.getElementById('sys-os').textContent = `${data.distro} (${data.platform})`;
    document.getElementById('sys-host').textContent = data.hostname;
    document.getElementById('sys-uptime').textContent = formatUptime(data.uptime);

    // Total CPU
    document.getElementById('sys-cpu-val').textContent = `${data.cpuLoad}%`;
    document.getElementById('sys-cpu-bar').style.width = `${data.cpuLoad}%`;
    const cpuBar = document.getElementById('sys-cpu-bar');
    cpuBar.style.backgroundColor = data.cpuLoad > 80 ? '#ff5555' : (data.cpuLoad > 50 ? '#ffa500' : '#4caf50');

    // Total Temp
    if (data.cpuTemp != -1) {
        document.getElementById('sys-temp').textContent = `${parseFloat(data.cpuTemp).toFixed(1)}°C`;
    } else {
        document.getElementById('sys-temp').textContent = '';
    }

    // Memory
    document.getElementById('sys-mem-val').textContent = `${data.memPercent}%`;
    document.getElementById('sys-mem-text').textContent = `${formatBytes(data.memUsed)} / ${formatBytes(data.memTotal)}`;
    document.getElementById('sys-mem-bar').style.width = `${data.memPercent}%`;

    // Core Data
    const coresContainer = document.getElementById('sys-cores-container');
    if (showCores && data.cpus && data.cpus.length > 0) {
        coresContainer.style.display = 'block';
        coresContainer.innerHTML = ''; 

        data.cpus.forEach((core, i) => {
            const row = document.createElement('div');
            row.className = 'sys-core-row';
            
            const tempStr = core.temp ? `<span style="color:#aaa; font-size:10px; margin-right:5px;">${core.temp}°C</span>` : '';
            const color = core.load > 80 ? '#ff5555' : (core.load > 50 ? '#ffa500' : '#4caf50');

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
      border-radius: 8px 8px 0 0; display:flex; justify-content:space-between;
    }
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
    <div id="sysinfo-header"><span>System Monitor</span></div>
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
            <span>
                <span id="sys-temp" style="color:#aaa; font-size:11px; margin-right:5px"></span> 
                <span id="sys-cpu-val" class="sys-val">0%</span>
            </span>
        </div>
        <div class="sys-bar-bg"><div id="sys-cpu-bar" class="sys-bar-fill"></div></div>
        
        <div id="sys-cores-container"></div>
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
                <span style="color:#4caf50" id="sys-net-down">↓ 0 B/s</span>
                <span style="color:#2196F3" id="sys-net-up">↑ 0 B/s</span>
            </div>
          </div>
      </div>

    </div>
  `;
  document.body.appendChild(overlay);

  // Toggle Logic with instant update
  const toggleBtn = document.getElementById('sys-cpu-toggle');
  toggleBtn.addEventListener('click', () => {
      showCores = !showCores;
      if (showCores) toggleBtn.classList.add('open');
      else toggleBtn.classList.remove('open');
      
      // Update UI immediately with cached data
      if (lastData) {
          updateUI(lastData);
      }
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
      if (e.target.id === 'sys-cpu-toggle') return;
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
    // Only create button if Admin or if restriction is disabled
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
              $btn.toggleClass('active', active);
              if (active) $('#sysinfo-overlay').stop(true, true).fadeIn(400);
              else $('#sysinfo-overlay').stop(true, true).fadeOut(400);
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