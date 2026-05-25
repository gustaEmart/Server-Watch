Set shell = CreateObject("WScript.Shell")
command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & Replace(WScript.ScriptFullName, "RunInstaller.vbs", "RunElevated.ps1") & """"
exitCode = shell.Run(command, 0, True)
WScript.Quit exitCode
