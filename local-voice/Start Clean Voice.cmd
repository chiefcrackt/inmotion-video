@echo off
cd /d "%~dp0.."
if not exist ".venv-clean-voice\Scripts\python.exe" (
  py -3.12 -m venv .venv-clean-voice
  if errorlevel 1 goto failed
)
".venv-clean-voice\Scripts\python.exe" local-voice\check_install.py >nul 2>&1
if errorlevel 1 (
  echo Installing Clean Voice's engines. The first time takes a few minutes.
  ".venv-clean-voice\Scripts\python.exe" -m pip install -r local-voice\requirements.txt
  if errorlevel 1 goto failed
)
rem Runs in the background with no window: the page has a Stop button.
start "" ".venv-clean-voice\Scripts\pythonw.exe" local-voice\server.py
powershell -NoProfile -Command "for ($i = 0; $i -lt 60; $i++) { try { Invoke-WebRequest http://127.0.0.1:8766/app.js -UseBasicParsing -TimeoutSec 2 | Out-Null; exit 0 } catch { Start-Sleep -Milliseconds 500 } }; exit 1"
if errorlevel 1 goto failed
exit /b
:failed
echo Clean Voice could not start. See the error above, or the end of its log:
if exist "local-voice\data\server.log" powershell -NoProfile -Command "Get-Content local-voice\data\server.log -Tail 15"
pause
