Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c """ & WScript.ScriptFullName & "\..\run.bat""", 0, False
