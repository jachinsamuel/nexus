Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "d:\Projects\JARVIS"
WshShell.Run "python -m uvicorn app.main:app --host 127.0.0.1 --port 8001", 0, False
WScript.Sleep 2000
WshShell.Run "http://localhost:8001"
