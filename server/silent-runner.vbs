Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\Mert\Desktop\Plasiyer\server"
WshShell.Run Chr(34) & "C:\Program Files\nodejs\node.exe" & Chr(34) & " src/index.js", 0, False
