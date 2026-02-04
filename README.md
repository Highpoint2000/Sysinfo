# Sysinfo Plugin for [FM-DX-Webserver](https://github.com/NoobishSVK/fm-dx-webserver)
This plugin displays relevant system data on the web interface.

<img width="1443" height="833" alt="image" src="https://github.com/user-attachments/assets/508b5a2c-c623-4ead-ba59-c847d8870469" />


## Version 1.0

Information on:
- System name, OS and uptime
- Total CPU and individual core utilization including temperature
- Memory utilization
- Network information (IP adress only for admins)

The plugin can be configured client-side so that only administrators have access to it.

## Installation notes:

1. [Download](https://github.com/Highpoint2000/Syslog/releases) the last repository as a zip
2. Unpack all files from the plugins folder to ..fm-dx-webserver-main\plugins\ 
3. Stop or close the fm-dx-webserver
4. Start/Restart the fm-dx-webserver with "npm run webserver" on node.js console, check the console informations
5. Activate the sysinfo plugin in the settings
6. Stop or close the fm-dx-webserver
7. Start/Restart the fm-dx-webserver with "npm run webserver" on node.js console, check the console informations

## Configuration options:

The following variables can be changed in the sysinfo.js:

    RestrictButtonToAdmin = false; // Set this setting to true, the Sysinfo button will only be displayed to authorized users (deafult = false)
    pluginSetupOnlyNotify = true;  // If true (default): The notification of an available update (the red dot and text) will only be displayed if you are on the configuration page (/setup)
    CHECK_FOR_UPDATES = true;	   // You can disable the update check by typing false (default = true)

## Notes: 

The IP address of the interface used is only displayed to logged-in users.


## Contact

If you have any questions, would like to report problems, or have suggestions for improvement, please feel free to contact me! You can reach me by email at highpoint2000@googlemail.com. I look forward to hearing from you!

<a href="https://www.buymeacoffee.com/Highpoint" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>

<details>
<summary>History</summary>
