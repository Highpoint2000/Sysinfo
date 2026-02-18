# Sysinfo Plugin for [FM-DX-Webserver](https://github.com/NoobishSVK/fm-dx-webserver)
This plugin displays relevant system data on the web interface.

<img width="1446" height="832" alt="image" src="https://github.com/user-attachments/assets/23723773-30ed-469a-8cdd-41a27463c35b" />

## Version 1.3

- Storage capacity display now only visible to administrators
- Enabling the Sysinfo button for all users is now available as a fixed setting in the sysinfo.json file located in the \plugin_configs folder

## Installation notes:

1. [Download](https://github.com/Highpoint2000/Syslog/releases) the last repository as a zip
2. Unpack all files from the plugins folder to ..fm-dx-webserver-main\plugins\ 
3. Stop or close the fm-dx-webserver
4. Start/Restart the fm-dx-webserver with "npm run webserver" on node.js console, check the console informations
5. Activate the sysinfo plugin in the settings
6. Stop or close the fm-dx-webserver
7. Start/Restart the fm-dx-webserver with "npm run webserver" (Important for the automatic installation of the Node.js module for system information!), check the console informations on node.js console

## Configuration options:

The following variables can be changed in the sysinfo.json:

    "UpdateInterval": 2000,          // Configure the update interval here (default is 2000)
    "RestrictButtonToAdmin": true   // Set it to false if the system info button should be accessible for all users (default is true) 

After making changes to the script, the server must be restarted!!!

## Notes: 

- The IP address and storage capacity of the interface used is only displayed to logged-in users
- You can freely move the window on the web interface using drag and drop
- The small triangle next to CPU Load displays the utilization of individual cores
- Displaying the CPU temperature level is only supported on Linux devices
- In the settings, you can restrict access to only administrators

## Contact

If you have any questions, would like to report problems, or have suggestions for improvement, please feel free to contact me! You can reach me by email at highpoint2000@googlemail.com. I look forward to hearing from you!

<a href="https://www.buymeacoffee.com/Highpoint" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>

<details>
<summary>History</summary>

### Version 1.2

- CPU load under Windows significantly reduced

The plugin can be configured client-side so that only administrators have access to it. Don't forget to restart your computer after activating the plugin!

### Version 1.1

- Added X to close window
- Added CPU temperature level meter (Linux only)
- Added primary drive storage space indicator
- Color gradation (green, orange, red) now applies to all bars

### Version 1.0

Information on:
- System name, OS and uptime
- Total CPU and individual core utilization including temperature
- Memory utilization
- Network information (IP adress only for admins)
