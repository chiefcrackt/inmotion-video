@echo off
cd /d "%~dp0.."
if not exist ".venv-voiceover\Scripts\python.exe" (
  py -3.12 -m venv .venv-voiceover
  if errorlevel 1 goto failed
)
".venv-voiceover\Scripts\python.exe" local-voiceover\check_install.py >nul 2>&1
if errorlevel 1 (
  echo Installing Voiceover's engine. The first time takes a few minutes.
  ".venv-voiceover\Scripts\python.exe" -m pip install -r local-voiceover\requirements.txt
  if errorlevel 1 goto failed
)
rem Runs in the background with no window: the page has a Stop button.
start "" ".venv-voiceover\Scripts\pythonw.exe" local-voiceover\server.py
powershell -NoProfile -Command "for ($i = 0; $i -lt 60; $i++) { try { Invoke-WebRequest http://127.0.0.1:8767/app.js -UseBasicParsing -TimeoutSec 2 | Out-Null; exit 0 } catch { Start-Sleep -Milliseconds 500 } }; exit 1"
if errorlevel 1 goto failed
exit /b
:failed
echo Voiceover could not start. See the error above, or the end of its log:
if exist "local-voiceover\data\server.log" powershell -NoProfile -Command "Get-Content local-voiceover\data\server.log -Tail 15"
pause
